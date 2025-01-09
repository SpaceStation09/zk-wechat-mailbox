//SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import {Verifier} from "./lib/VerifierWechat.sol";
import "@zk-email/contracts/DKIMRegistry.sol";
import "@zk-email/contracts/utils/StringUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TokenMailbox {
    using SafeERC20 for IERC20;

    uint16 public constant BYTES_IN_PACKED_SIGNAL = 31;
    uint32 public constant PUBKEY_HASH_INDEX_IN_SIGNAL = 0;
    uint32 public constant USERNAME_INDEX_IN_SIGNAL = 1;
    uint32 public constant ADDRESS_INDEX_IN_SIGNAL = 2;
    string public constant DOMAIN = "tencent.com";

    bytes32 private immutable userNameHash;
    DKIMRegistry public dkimRegistry;
    Verifier public immutable verifier;

    event EtherReceived(address indexed from, uint256 amount);

    constructor(Verifier _verifier, DKIMRegistry _dkimRegistry, bytes32 _userNameHash) {
        verifier = _verifier;
        dkimRegistry = _dkimRegistry;
        userNameHash = _userNameHash;
    }

    receive() external payable {
        emit EtherReceived(msg.sender, msg.value);
    }

    function withdrawToken(
        address _token,
        address _recipient,
        uint[8] calldata _proof,
        uint[3] calldata _signals
    ) public {
        address addressInCircuit = address(uint160(_signals[ADDRESS_INDEX_IN_SIGNAL]));
        require(_recipient == addressInCircuit, "Invalid recipient");
        bytes32 nameHash = keccak256(abi.encodePacked(_signals[USERNAME_INDEX_IN_SIGNAL]));
        require(nameHash == userNameHash, "Invalid username");
        // Check email validity via zk
        (bool success, string memory errorMessage) = _checkProof(DOMAIN, _proof, _signals);
        if (!success) revert(errorMessage);
        if (_token == address(0)) {
            payable(_recipient).transfer(address(this).balance);
        } else {
            IERC20(_token).safeTransfer(_recipient, IERC20(_token).balanceOf(address(this)));
        }
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
}
