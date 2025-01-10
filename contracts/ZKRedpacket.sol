// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Verifier} from "./lib/VerifierWechat.sol";
import "@zk-email/contracts/DKIMRegistry.sol";
import "@zk-email/contracts/utils/StringUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import "./TokenMailbox.sol";

contract ZKRedpacket {
    using SafeERC20 for IERC20;
    struct RedPacket {
        address creator;
        Packed packed;
        mapping(address => uint) claimedList;
        mapping(bytes32 => bool) claimedUsername;
    }

    struct Packed {
        uint256 packed1; // 0 (128) total_tokens (96) expire_time(32)
        uint256 packed2; // 0 (64) token_addr (160) claimed_numbers(15) total_numbers(15) token_type(1) ifrandom(1)
    }

    enum TokenType {
        Ether, // native token
        FT // ERC20 token
    }

    uint16 public constant BYTES_IN_PACKED_SIGNAL = 31;
    uint32 public constant PUBKEY_HASH_INDEX_IN_SIGNAL = 0;
    uint32 public constant USERNAME_INDEX_IN_SIGNAL = 1;
    uint32 public constant ADDRESS_INDEX_IN_SIGNAL = 2;

    string public constant DOMAIN = "tencent.com";
    uint32 public nonce;
    address public deployer;
    bytes32 private seed;
    mapping(bytes32 => RedPacket) public rpById;
    DKIMRegistry public dkimRegistry;
    Verifier public immutable verifier;

    event CreationSuccess(
        bytes32 indexed id,
        uint256 tokenAmount,
        string name,
        string message,
        address creator,
        uint256 creationTime,
        address tokenAddr,
        uint256 number,
        bool ifrandom,
        uint256 duration
    );

    event ClaimSuccess(bytes32 indexed id, address indexed _recipient, uint256 claimedAmount, address tokenAddress);

    event RefundSuccess(bytes32 indexed id, address tokenAddress, uint tokenAmount);

    constructor(Verifier _verifier, DKIMRegistry _dkimRegistry, address _deployer) {
        verifier = _verifier;
        dkimRegistry = _dkimRegistry;
        seed = keccak256(abi.encodePacked("Former NBA Commissioner David St", block.timestamp, msg.sender));
        deployer = _deployer;
    }

    function createPacket(
        uint256 _number,
        bool _ifRandom,
        uint256 _duration,
        bytes32 _seed,
        string memory _name,
        string memory _message,
        TokenType _tokenType,
        address _tokenAddr,
        uint256 _tokenAmount
    ) external payable {
        nonce++;
        require(_tokenAmount >= _number, "#tokens > #packets");
        //TODO: number upper limit
        require(_number > 0 && _number < 256, "packet number should be in range [1, 255]");

        uint256 receivedAmount = _tokenAmount;
        if (_tokenType == TokenType.Ether) require(msg.value >= receivedAmount, "Ether amount not enough");
        else if (_tokenType == TokenType.FT) {
            uint balanceBeforeTransfer = IERC20(_tokenAddr).balanceOf(address(this));
            IERC20(_tokenAddr).safeTransferFrom(msg.sender, address(this), receivedAmount);
            uint balanceAfterTransfer = IERC20(_tokenAddr).balanceOf(address(this));
            receivedAmount = balanceAfterTransfer - balanceBeforeTransfer;
            require(receivedAmount >= _number, "#received token > #packets");
        }

        bytes32 packetId = keccak256(abi.encodePacked(msg.sender, block.timestamp, nonce, seed, _seed));
        uint8 randomType = _ifRandom ? 1 : 0;
        RedPacket storage rp = rpById[packetId];
        rp.packed.packed1 = _wrap1(receivedAmount, _duration);
        rp.packed.packed2 = _wrap2(_tokenAddr, _number, _tokenType, randomType);
        rp.creator = msg.sender;

        emit CreationSuccess(
            packetId,
            receivedAmount,
            _name,
            _message,
            msg.sender,
            block.timestamp,
            _tokenAddr,
            _number,
            _ifRandom,
            _duration
        );
    }

    function claim(bytes32 _id, uint[8] calldata _proof, uint[3] calldata _signals) external {
        RedPacket storage rp = rpById[_id];
        Packed memory packed = rp.packed;
        //Condition Check for Redpacket
        require(_unbox(packed.packed1, 224, 32) > block.timestamp, "Expired");
        uint pktNumber = _unbox(packed.packed2, 239, 15);
        uint claimedNumber = _unbox(packed.packed2, 224, 15);
        require(claimedNumber < pktNumber, "Out of stock");

        // Check the recipient is the address committed in circuit
        address addressInCircuit = address(uint160(_signals[ADDRESS_INDEX_IN_SIGNAL]));
        bytes32 userNameHash = bytes32(_signals[USERNAME_INDEX_IN_SIGNAL]);
        bytes memory byteCode = abi.encodePacked(
            type(TokenMailbox).creationCode,
            abi.encode(address(verifier), address(dkimRegistry), userNameHash)
        );
        address recipient = Create2.computeAddress(userNameHash, keccak256(byteCode), deployer);
        require(recipient == addressInCircuit, "Invalid recipient");
        require(rp.claimedList[recipient] == 0, "Already claimed");

        // Check email validity via zk
        (bool success, string memory errorMessage) = _checkProof(DOMAIN, _proof, _signals);
        if (!success) revert(errorMessage);

        require(!rp.claimedUsername[userNameHash], "This username already used");
        rp.claimedUsername[userNameHash] = true;

        uint claimedTokens;
        uint tokenType = _unbox(packed.packed2, 254, 1);
        uint ifRandom = _unbox(packed.packed2, 255, 1);
        uint remainingTokens = _unbox(packed.packed1, 128, 96);
        if (pktNumber - claimedNumber == 1) claimedTokens = remainingTokens;
        if (ifRandom == 1) {
            claimedTokens = _random(nonce) % ((remainingTokens * 2) / (pktNumber - claimedNumber));
            if (claimedTokens == 0) claimedTokens = 1;
        } else {
            claimedTokens = remainingTokens / (pktNumber - claimedNumber);
        }
        rp.packed.packed1 = _rewriteBox(packed.packed1, 128, 96, remainingTokens - claimedTokens);
        rp.claimedList[recipient] = claimedTokens;
        rp.packed.packed2 = _rewriteBox(packed.packed2, 224, 15, claimedNumber + 1);

        address tokenAddress = address(uint160(_unbox(packed.packed2, 64, 160)));
        if (tokenType == 0) payable(recipient).transfer(claimedTokens);
        else IERC20(tokenAddress).safeTransfer(recipient, claimedTokens);
        emit ClaimSuccess(_id, recipient, claimedTokens, tokenAddress);
    }

    function refund(bytes32 _id) public {
        RedPacket storage rp = rpById[_id];
        Packed memory packed = rp.packed;
        require(rp.creator == msg.sender, "Only creator can refund");
        require(_unbox(packed.packed1, 224, 32) <= block.timestamp, "Not expired yet");
        uint remainingTokens = _unbox(packed.packed1, 128, 96);
        require(remainingTokens != 0, "Nothing left");

        uint tokenType = _unbox(packed.packed2, 254, 1);
        address tokenAddress = address(uint160(_unbox(packed.packed2, 64, 160)));

        rp.packed.packed1 = _rewriteBox(packed.packed1, 128, 96, 0);

        if (tokenType == 0) payable(msg.sender).transfer(remainingTokens);
        IERC20(tokenAddress).safeTransfer(msg.sender, remainingTokens);
        emit RefundSuccess(_id, tokenAddress, remainingTokens);
    }

    function checkAvailability(
        bytes32 _id,
        address _user
    )
        public
        view
        returns (address tokenAddr, uint balance, uint pktNumber, uint claimedPkts, bool expired, uint claimedAmount)
    {
        RedPacket storage rp = rpById[_id];
        Packed memory packed = rp.packed;
        return (
            address(uint160(_unbox(packed.packed2, 64, 160))),
            _unbox(packed.packed1, 128, 96),
            _unbox(packed.packed2, 239, 15),
            _unbox(packed.packed2, 224, 15),
            block.timestamp > _unbox(packed.packed1, 224, 32),
            rp.claimedList[_user]
        );
    }

    function _checkProof(
        string memory _domain,
        uint[8] calldata _proof,
        uint[3] calldata _signals
    ) internal view returns (bool, string memory) {
        bytes32 dkimPubkeyHashInCircuit = bytes32(_signals[PUBKEY_HASH_INDEX_IN_SIGNAL]);
        if (!dkimRegistry.isDKIMPublicKeyHashValid(_domain, dkimPubkeyHashInCircuit)) return (false, "Invalid Domain");
        if (
            !verifier.verifyProof(
                [_proof[0], _proof[1]],
                [[_proof[2], _proof[3]], [_proof[4], _proof[5]]],
                [_proof[6], _proof[7]],
                _signals
            )
        ) return (false, "Invalid ZK proof");
        return (true, "");
    }

    function _random(uint32 _nonceRand) internal view returns (uint256) {
        return uint(keccak256(abi.encodePacked(_nonceRand, msg.sender, seed, block.timestamp))) + 1;
    }

    function _wrap1(uint256 _tokenAmount, uint256 _duration) internal view returns (uint256) {
        uint256 _packed1 = 0;
        _packed1 |= _box(128, 96, _tokenAmount); // total tokens = 80 bits = ~8 * 10^10 18 decimals
        _packed1 |= _box(224, 32, (block.timestamp + _duration)); // expiration_time = 32 bits (until 2106)
        return _packed1;
    }

    function _wrap2(
        address _tokenAddr,
        uint256 _number,
        TokenType _tokenType,
        uint256 _ifrandom
    ) internal pure returns (uint256) {
        uint256 _packed2 = 0;
        _packed2 |= _box(64, 160, uint160(_tokenAddr)); // token_address = 160 bits
        _packed2 |= _box(224, 15, 0); // claimed_number = 14 bits 16384
        _packed2 |= _box(239, 15, _number); // total_number = 14 bits 16384
        _packed2 |= _box(254, 1, uint8(_tokenType)); // token_type = 1 bit 2
        _packed2 |= _box(255, 1, _ifrandom); // ifrandom = 1 bit 2
        return _packed2;
    }

    /**
     * position      position in a memory block
     * size          data size
     * data          data
     * box() inserts the data in a 256bit word with the given position and returns it
     * data is checked by validRange() to make sure it is not over size
     **/

    function _box(uint16 position, uint16 size, uint256 data) internal pure returns (uint256 boxed) {
        require(_validRange(size, data), "Value out of range BOX");
        assembly {
            // data << position
            boxed := shl(position, data)
        }
    }

    /**
     * position      position in a memory block
     * size          data size
     * base          base data
     * unbox() extracts the data out of a 256bit word with the given position and returns it
     * base is checked by validRange() to make sure it is not over size
     **/

    function _unbox(uint256 base, uint16 position, uint16 size) internal pure returns (uint256 unboxed) {
        require(_validRange(256, base), "Value out of range UNBOX");
        assembly {
            // (((1 << size) - 1) & base >> position)
            unboxed := and(sub(shl(size, 1), 1), shr(position, base))
        }
    }

    /**
     * size          data size
     * data          data
     * validRange()  checks if the given data is over the specified data size
     **/

    function _validRange(uint16 size, uint256 data) internal pure returns (bool ifValid) {
        assembly {
            // 2^size > data or size ==256
            ifValid := or(eq(size, 256), gt(shl(size, 1), data))
        }
    }

    /**
     * _box          32byte data to be modified
     * position      position in a memory block
     * size          data size
     * data          data to be inserted
     * rewriteBox() updates a 32byte word with a data at the given position with the specified size
     **/

    function _rewriteBox(
        uint256 box,
        uint16 position,
        uint16 size,
        uint256 data
    ) internal pure returns (uint256 boxed) {
        assembly {
            // mask = ~((1 << size - 1) << position)
            // _box = (mask & _box) | ()data << position)
            boxed := or(and(box, not(shl(position, sub(shl(size, 1), 1)))), shl(position, data))
        }
    }
}
