//SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.12;

import "./TokenMailbox.sol";
import "@openzeppelin/contracts/utils/Create2.sol";
import {Verifier} from "./lib/VerifierWechat.sol";
import "@zk-email/contracts/DKIMRegistry.sol";

contract MailboxFactory {
    DKIMRegistry public dkimRegistry;
    Verifier public immutable verifier;

    event MailboxDeployed(bytes32 indexed nameHash, address mailboxAddr);

    constructor(Verifier _verifier, DKIMRegistry _dkimRegistry) {
        verifier = _verifier;
        dkimRegistry = _dkimRegistry;
    }

    function createMailbox(bytes32 _nameHash) external {
        address boxAddr = computeMailboxAddress(_nameHash);
        uint256 codeSize = boxAddr.code.length;
        if (codeSize > 0) {
            revert("Mailbox already deployed");
        } else {
            TokenMailbox mailbox = new TokenMailbox{salt: _nameHash}(verifier, dkimRegistry, _nameHash);
            emit MailboxDeployed(_nameHash, address(mailbox));
        }
    }

    function computeMailboxAddress(bytes32 _nameHash) public view returns (address) {
        bytes memory byteCode = abi.encodePacked(
            type(TokenMailbox).creationCode,
            abi.encode(address(verifier), address(dkimRegistry), _nameHash)
        );
        return Create2.computeAddress(_nameHash, keccak256(byteCode));
    }
}
