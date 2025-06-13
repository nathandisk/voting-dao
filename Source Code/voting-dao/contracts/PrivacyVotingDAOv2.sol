// SPDX-License-Identifier: Public Domain
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./SemaphoreVerifier.sol";
import "hardhat/console.sol";

interface IERC20Votes {
    function getVotes(address account) external view returns (uint256);
}

enum CountingMode {
    Simple,     // Each vote counts as 1
    Quadratic   // Votes are weighted by sqrt(governance token balance)
}

/// @title Privacy Voting DAO (v2)
/// @notice Implements private voting using zk-SNARKs and supports both simple and quadratic voting.
contract PrivacyVotingDAOv2 is Ownable {
    /* ---------- Constructor ---------- */

    /// @notice Initializes DAO with verifier, member root, and governance token.
    constructor(
        SemaphoreVerifier _verifier,
        uint256 _root,
        IERC20Votes _govToken
    ) Ownable(msg.sender) {
        verifier = _verifier;
        memberMerkleRoot = _root;
        govToken = _govToken;
    }

    /* ---------- Data Types ---------- */

    struct Proposal {
        string title;
        string description;
        CountingMode mode;
        string[] options;
        mapping(uint256 => uint256) tally;     // vote count per option
        mapping(uint256 => bool) nullifiers;   // prevents double voting
        uint64 closes;                         // closing timestamp
        bool closed;                           // whether the proposal is finalized
    }

    /* ---------- Storage ---------- */

    uint256 public memberMerkleRoot;                    // Merkle root of members eligible to vote
    uint256 public proposalCount;                       // Total proposals created
    mapping(uint256 => Proposal) private _proposals;    // ID to Proposal mapping
    SemaphoreVerifier public immutable verifier;        // ZK-SNARK verifier contract
    IERC20Votes public immutable govToken;              // Governance token for quadratic voting

    /* ---------- Events ---------- */

    event MemberRootUpdated(uint256 newRoot);
    event ProposalCreated(
        uint256 indexed id,
        CountingMode mode,
        string title,
        uint64 closes
    );
    event ProofVerified(
        uint256 indexed id,
        uint256 merkleRoot,
        uint256 nullifierHash,
        uint256 signalHash
    );
    event VoteCast(
        uint256 indexed id,
        uint8 option,
        uint256 nullifierHash,
        uint256 weight
    );
    event ProposalClosed(uint256 indexed id, uint8 winner);

    /* ---------- Owner-only ---------- */

    /// @notice Updates the member Merkle root.
    function updateMemberRoot(uint256 newRoot) external onlyOwner {
        memberMerkleRoot = newRoot;
        emit MemberRootUpdated(newRoot);
    }

    /// @notice Creates a new proposal with a specified voting mode and duration.
    function createProposal(
        string calldata title,
        string calldata description,
        CountingMode mode,
        string[] calldata options,
        uint32 duration
    ) external onlyOwner returns (uint256 id) {
        require(options.length >= 2, "need 2+ opts");
        id = ++proposalCount;
        Proposal storage p = _proposals[id];
        p.title = title;
        p.description = description;
        p.mode = mode;

        delete p.options;
        for (uint i = 0; i < options.length; i++) {
            p.options.push(options[i]);
        }

        p.closes = uint64(block.timestamp) + duration;
        emit ProposalCreated(id, mode, title, p.closes);
    }

    /// @notice Closes a proposal and computes the winning option.
    function closeProposal(uint256 id) public {
        Proposal storage p = _proposals[id];
        require(!p.closed, "already closed");
        require(block.timestamp >= p.closes, "not expired");
        p.closed = true;

        uint8 winner = type(uint8).max;
        uint256 high = 0;
        for (uint8 i = 0; i < p.options.length; ++i) {
            uint256 v = p.tally[i];
            if (v > high) {
                high = v;
                winner = i;
            } else if (v == high) {
                winner = type(uint8).max; // Tie
            }
        }

        emit ProposalClosed(id, winner);
    }

    /* ---------- Voting ---------- */

    /// @notice Cast a vote on a proposal with a zk-SNARK proof for anonymity.
    function vote(
        uint256 id,
        uint8 option,
        uint256 signalHash,
        uint256 nullifierHash,
        uint256 merkleRoot,
        uint256[8] calldata proof
    ) external {
        Proposal storage p = _proposals[id];
        require(block.timestamp < p.closes, "voting is closed");
        require(option < p.options.length, "invalid option");
        require(!p.nullifiers[nullifierHash], "vote already cast");
        require(merkleRoot == memberMerkleRoot, "invalid merkle root");

        // Validate signalHash matches encoded voting option
        bytes32 expectedSignalHash = keccak256(
            abi.encodePacked("VOTE_", _toString(option))
        );
        require(
            signalHash == uint256(expectedSignalHash),
            "signal-option mismatch"
        );

        // Verify zk-SNARK proof using SemaphoreVerifier
        uint256[4] memory publicSignals = [
            merkleRoot,
            nullifierHash,
            signalHash,
            id // External nullifier (proposal ID)
        ];

        bool ok = verifier.verifyProof(proof, publicSignals);
        require(ok, "invalid proof");

        emit ProofVerified(id, merkleRoot, nullifierHash, signalHash);

        // Register nullifier to prevent double voting
        p.nullifiers[nullifierHash] = true;

        uint256 weight = 1;
        if (
            p.mode == CountingMode.Quadratic && address(govToken) != address(0)
        ) {
            uint256 rawVotes = govToken.getVotes(msg.sender);
            weight = sqrt(rawVotes);
        }

        unchecked {
            p.tally[option] += weight;
        }

        emit VoteCast(id, option, nullifierHash, weight);

        // Automatically close if expired
        if (block.timestamp >= p.closes && !p.closed) {
            closeProposal(id);
        }
    }

    /* ---------- Reads ---------- */

    /// @notice Returns basic metadata about a proposal.
    function getProposal(
        uint256 id
    )
        external
        view
        returns (
            string memory title,
            CountingMode mode,
            bool open,
            uint64 closes,
            string[] memory options
        )
    {
        Proposal storage p = _proposals[id];
        return (
            p.title,
            p.mode,
            !p.closed && block.timestamp < p.closes,
            p.closes,
            p.options
        );
    }

    /// @notice Returns partial tally results for a proposal.
    function tallies(
        uint256 id,
        uint16 start,
        uint16 n
    ) external view returns (uint256[] memory out) {
        Proposal storage p = _proposals[id];
        uint16 len = uint16(p.options.length);
        require(start < len, "oob");
        uint16 end = (n == 0 || start + n > len || start + n < start)
            ? len
            : start + n;
        if (start >= end && len > 0) {
            out = new uint256[](0); // <-- Fix: avoid out-of-bounds
            return out;
        }
        out = new uint256[](end - start);
        for (uint16 i = start; i < end; ++i) {
            out[i - start] = p.tally[i];
        }
    }

    /* ---------- Internal ---------- */

    /// @dev Integer square root using Babylonian method
    function sqrt(uint256 x) private pure returns (uint256 y) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
    }

    /// @dev Converts uint256 to string
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
