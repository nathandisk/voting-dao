import React, { useState } from "react";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { ethers } from "ethers";
import { generateProof } from "@semaphore-protocol/proof";
import { packToSolidityProof } from "../utils/packToSolidityProof";

// Declare Swal as a global variable for SweetAlert popups
declare const Swal: any;

// Define the props expected by the Vote component
interface VoteProps {
  proposalId: number;
  options: string[];
  memberMerkleRoot: bigint | null;
  members: string[];
  identity: Identity | null;
  hasVoted: boolean;
  onVote: (
    proposalId: number,
    optionIndex: number,
    signalHash: bigint,
    nullifierHash: bigint,
    merkleRoot: bigint,
    proof: any,
    fullProofString: string,
    solidityProofString: string
  ) => void;
}

const Vote: React.FC<VoteProps> = ({
  proposalId,
  options,
  memberMerkleRoot,
  members,
  identity,
  hasVoted,
  onVote,
}) => {
  const [selectedOption, setSelectedOption] = useState<number>(0);
  const [voting, setVoting] = useState(false);

  // Handles vote submission, including generating a ZKP proof
  const handleVote = async () => {
    if (!identity) {
      Swal.fire("Identity Not Found", 'You must register an identity before voting.', "warning");
      return;
    }
    if (hasVoted) {
      Swal.fire("Already Voted", "You have already cast your vote for this proposal.", "info");
      return;
    }
    if (!memberMerkleRoot) {
      Swal.fire("Voting Not Yet Available", "Merkle group root has not been loaded from the contract.", "error");
      return;
    }

    try {
      setVoting(true);
      const group = new Group();
      group.addMembers(members.map(BigInt));

      if (group.indexOf(identity.commitment) === -1) {
        Swal.fire('Not a Group Member', `Your identity is not part of this voting group.`, 'error');
        setVoting(false);
        return;
      }

      const signal = `VOTE_${selectedOption}`;
      const signalHash = BigInt(ethers.solidityPackedKeccak256(['string'], [signal]));
      const externalNullifier = BigInt(proposalId);
      const wasmFilePath = "/circuits/semaphore.wasm";
      const zkeyFilePath = "/circuits/semaphore.zkey";
      const merkleTreeDepth = 20;

      const fullProof = await generateProof(
        identity,
        group,
        externalNullifier,
        signalHash,
        merkleTreeDepth,
        { wasm: wasmFilePath, zkey: zkeyFilePath }
      ) as any;

      console.log("Full Proof Object:", fullProof);

      const proofData = fullProof.points.map((p: string) => BigInt(p));
      const solidityProof = packToSolidityProof(proofData);

      console.log("Solidity Proof (Packed for Contract):", solidityProof);

      const fullProofString = JSON.stringify(fullProof, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value, 2);
      const solidityProofString = JSON.stringify(solidityProof, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value, 2);

      const merkleTreeRootFromProof = BigInt(fullProof.merkleTreeRoot);
      const nullifierHash = BigInt(fullProof.nullifier);
      const signalHashFromProof = BigInt(fullProof.scope);

      await onVote(
        proposalId,
        selectedOption,
        signalHashFromProof,
        nullifierHash,
        merkleTreeRootFromProof,
        solidityProof,
        fullProofString,
        solidityProofString
      );

    } catch (err: any) {
      console.error("Error during voting:", err);
      Swal.fire("Vote Failed", err.reason || err.message || "An error occurred while generating the proof. Check the console.", "error");
    } finally {
      setVoting(false);
    }
  };

  return (
    <div className="card p-3 shadow-sm">
      <h5 className="card-title">Submit Your Anonymous Vote</h5>
      <div className="form-group">
        <label htmlFor={`vote-select-${proposalId}`}>Choose your option</label>
        <select
          id={`vote-select-${proposalId}`}
          className="form-control"
          value={selectedOption}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            setSelectedOption(Number(e.target.value))
          }
          disabled={hasVoted || voting}
        >
          {options.map((opt, idx) => (
            <option key={idx} value={idx}>{opt}</option>
          ))}
        </select>
      </div>
      <button
        onClick={handleVote}
        className={`btn mt-3 ${hasVoted ? 'btn-secondary' : 'btn-primary'}`}
        disabled={voting || !memberMerkleRoot || !identity || hasVoted}
        title={
            hasVoted ? "You have already voted on this proposal" :
            !identity ? "Please register your identity first" : 
            !memberMerkleRoot ? "Waiting for Merkle root..." : 
            "Submit your vote"
        }
      >
        {voting ? (
          <>
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <span> Submitting...</span>
          </>
        ) : hasVoted ? "Already Voted" : "Submit Anonymous Vote"}
      </button>
    </div>
  );
};

export default Vote;
