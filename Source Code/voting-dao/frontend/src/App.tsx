import React, { useState, useEffect } from "react";
import { ethers, Contract, Signer } from "ethers";
import { BrowserRouter as Router, Routes, Route, Link } from "react-router-dom";
import { Identity } from "@semaphore-protocol/identity";
import "./App.css";

// Import the ABI (Application Binary Interface) of the smart contract
import DAO_ABI from "./abis/PrivacyVotingDAOv2.json";
// Import the React components to be used
import CreateProposal from "./components/CreateProposal";
import Vote from "./components/Vote";
import Register from "./components/Register";

// Declare Swal (SweetAlert) as a global variable for popup notifications
declare const Swal: any;

// The address of the deployed DAO smart contract
const DAO_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// Define the data structure (interface) for a proposal
interface Proposal {
  id: number;
  title: string;
  mode: number;
  open: boolean;
  closes: number;
  options: string[];
  tally?: bigint[];
}

/**
 * Main application component (App).
 * Manages main state, smart contract interaction, and routing.
 */
export default function App() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [dao, setDao] = useState<Contract | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [memberMerkleRoot, setMemberMerkleRoot] = useState<bigint | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [votedProposalIds, setVotedProposalIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const init = async () => {
      const initialMembers: string[] = [
        "19578321284379261479951354471353484202061003775662017676802743947860909013807", "15726912462015966406672618542702632965322252428400947996599523114086132293048", "3349239835911276752226766323029155936278537914534743235572441778649779322782", "2600102627891300583157347575137619256962368529350331186960495675982526305575", "19084624363116332266865535702345243199025590950950100661988872790749458396333", "13717464261984787093234082392988040683803657610381838764807576165694379569668", "16715056398278591747647727195801163183760965406868293756826525178929976736317", "11738727273595878867096995974431400740067257293018991018424190337706368440114", "20617838500489062694758951007709828329647072435770699580775648103981578492452", "797850755926586760281904830811393890383471758765740622876361371670120864261"
      ];
      setMembers(initialMembers);

      const storedSecret = localStorage.getItem("semaphore-secret");
      let currentIdentity: Identity | null = null;
      if (storedSecret) {
        currentIdentity = new Identity(storedSecret);
        setIdentity(currentIdentity);
      }

      if (currentIdentity) {
        const identityCommitment = currentIdentity.commitment.toString();
        const storedVotedIds = localStorage.getItem(`voted_ids_${identityCommitment}`);
        if (storedVotedIds) {
          setVotedProposalIds(new Set(JSON.parse(storedVotedIds)));
        }
      }

      if ((window as any).ethereum) {
        try {
          const provider = new ethers.BrowserProvider((window as any).ethereum);
          const currentSigner = await provider.getSigner();
          setSigner(currentSigner);
          const contract = new ethers.Contract(DAO_ADDRESS, DAO_ABI.abi, currentSigner);
          setDao(contract);
          const root: bigint = await contract.memberMerkleRoot();
          setMemberMerkleRoot(root);
          await fetchProposals(contract);
        } catch (error) {
          console.error("Initialization error:", error);
        }
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (!dao) return;
    const intervalId = setInterval(() => {
      fetchProposals(dao);
    }, 10000);
    return () => clearInterval(intervalId);
  }, [dao]);

  const fetchProposals = async (contract: ethers.Contract) => {
    try {
      const countBigInt: bigint = await contract.proposalCount();
      const count = Number(countBigInt);
      const list: Proposal[] = [];
      for (let i = count; i >= 1; i--) {
        const p = await contract.getProposal(i);
        const isOpen = p[2];
        let tallyData: bigint[] | undefined = undefined;
        if (!isOpen) {
          try {
            // === FIX: Use `tallies` as per the test file ===
            // This function requires the proposal ID, starting index, and number of options
            const optionsCount = p[4].length;
            tallyData = await contract.tallies(i, 0, optionsCount);
          } catch (tallyError) {
            console.error(`Failed to fetch tally result for proposal ID ${i}:`, tallyError);
          }
        }
        list.push({
          id: i,
          title: p[0],
          mode: Number(p[1]),
          open: isOpen,
          closes: Number(p[3]),
          options: p[4],
          tally: tallyData,
        });
      }
      setProposals(list);
    } catch (error) {
      console.error("Failed to fetch proposals:", error);
    }
  };

  const handleCreateProposal = async (
    title: string,
    description: string,
    mode: number,
    options: string[],
    duration: number
  ) => {
    console.log("handleCreateProposal function started with data:", { title, description, mode, options, duration });

    if (!dao || !signer) {
      console.error("FAILED: DAO or Signer object not initialized. Check connection to MetaMask.");
      Swal.fire('Error', 'Contract or Signer not initialized. Please connect your wallet and refresh the page.', 'error');
      return;
    }

    try {
      console.log("Attempting to send 'createProposal' transaction to the smart contract...");
      const tx = await dao.createProposal(title, description, mode, options, duration);

      console.log("Transaction sent. Waiting for blockchain confirmation...", tx);
      await tx.wait();

      console.log("Transaction successfully confirmed by the blockchain!");
      Swal.fire('Success!', 'Proposal successfully created!', 'success');
      await fetchProposals(dao);
    } catch (error: any) {
      console.error("Proposal creation failed:", error);
      Swal.fire('Error', `Proposal Creation Failed: ${error.reason || "An unknown error occurred."}`, 'error');
    }
  };

  const handleVote = async (
    proposalId: number,
    optionIndex: number,
    signalHash: bigint,
    nullifierHash: bigint,
    merkleRoot: bigint,
    proof: string[],
    fullProofString: string,
    solidityProofString: string
  ) => {
    if (!dao || !identity) return;

    if (votedProposalIds.has(proposalId)) {
      Swal.fire('Already Voted', 'You have already cast your vote for this proposal.', 'warning');
      return;
    }

    try {
      const tx = await dao.vote(proposalId, optionIndex, signalHash, nullifierHash, merkleRoot, proof);
      await tx.wait();

      const newVotedIds = new Set(votedProposalIds).add(proposalId);
      setVotedProposalIds(newVotedIds);
      const identityCommitment = identity.commitment.toString();
      localStorage.setItem(`voted_ids_${identityCommitment}`, JSON.stringify(Array.from(newVotedIds)));

      Swal.fire({
        icon: 'success',
        title: 'Vote Successful & Proof Generated!',
        html: `
          <p>Your anonymous vote was successfully submitted and recorded on the blockchain.</p>
          <div style="text-align: left; margin-top: 20px; font-size: 0.9em;">
            <strong>Solidity Proof (for contract):</strong>
            <pre style="background-color: #f1f1f1; border: 1px solid #ddd; padding: 10px; border-radius: 5px; max-height: 150px; overflow-y: auto; word-wrap: break-word; white-space: pre-wrap;"><code>${solidityProofString}</code></pre>
            <strong style="margin-top: 15px; display: block;">Full Proof (raw object):</strong>
            <pre style="background-color: #f1f1f1; border: 1px solid #ddd; padding: 10px; border-radius: 5px; max-height: 200px; overflow-y: auto; word-wrap: break-word; white-space: pre-wrap;"><code>${fullProofString}</code></pre>
          </div>
        `,
        confirmButtonText: 'Close',
        width: '600px',
      });

      await fetchProposals(dao);
    } catch (error: any) {
      console.error("Vote failed:", error);
      if (error.reason && error.reason.includes("Nullifier already used")) {
        Swal.fire('Vote Failed', 'You have already voted for this proposal (nullifier already used).', 'error');
        const newVotedIds = new Set(votedProposalIds).add(proposalId);
        setVotedProposalIds(newVotedIds);
        const identityCommitment = identity.commitment.toString();
        localStorage.setItem(`voted_ids_${identityCommitment}`, JSON.stringify(Array.from(newVotedIds)));
      } else {
        Swal.fire('Vote Failed', error.reason || "An unknown error occurred.", 'error');
      }
    }
  };

  const handleRegister = (secret: string) => {
    const newIdentity = new Identity(secret);
    localStorage.setItem("semaphore-secret", secret);
    setIdentity(newIdentity);
    setVotedProposalIds(new Set());
    return newIdentity;
  };

  const handleClearIdentity = () => {
    if (identity) {
      const identityCommitment = identity.commitment.toString();
      localStorage.removeItem(`voted_ids_${identityCommitment}`);
    }
    localStorage.removeItem("semaphore-secret");
    setIdentity(null);
    setVotedProposalIds(new Set());
  };

  return (
    <Router>
      <div className="app-container">
        <nav className="nav">
          <Link to="/" className="nav-link">🏠 Home</Link>
          <Link to="/register" className="nav-link">📝 Register</Link>
        </nav>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <h1>DAO Voting DApp</h1>
                <CreateProposal onCreate={handleCreateProposal} />
                {proposals.map((proposal) => (
                  <div key={proposal.id} className="card">
                    <h2>{proposal.title}</h2>
                    <p>Voting System: {proposal.mode === 0 ? "Yes/No" : "Multiple Choice"}</p>
                    <p>Status: <span className={proposal.open ? "status-open" : "status-closed"}>{proposal.open ? "Open" : "Closed"}</span></p>
                    <p>Closes on: {new Date(Number(proposal.closes) * 1000).toLocaleString()}</p>
                    <div className="proposal-options">
                      <p>Options:</p>
                      <ul>{proposal.options.map((opt, idx) => (<li key={idx}>{opt}</li>))}</ul>
                    </div>
                    {proposal.open && memberMerkleRoot && (
                      <div className="vote-section">
                        <Vote
                          proposalId={proposal.id}
                          options={proposal.options}
                          onVote={handleVote}
                          memberMerkleRoot={memberMerkleRoot}
                          members={members}
                          identity={identity}
                          hasVoted={votedProposalIds.has(proposal.id)}
                        />
                      </div>
                    )}
                    {!proposal.open && proposal.tally && (
                      <div className="tally-section">
                        <h4>Final Voting Results:</h4>
                        <ul>
                          {proposal.options.map((opt, idx) => (
                            <li key={idx}><strong>{opt}:</strong> {proposal.tally![idx].toString()} votes</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!proposal.open && !proposal.tally && (
                      <div className="tally-section"><p>Voting results could not be loaded.</p></div>
                    )}
                  </div>
                ))}
              </>
            }
          />
          <Route 
            path="/register" 
            element={
              <Register 
                identity={identity}
                onRegister={handleRegister}
                onClear={handleClearIdentity}
              />
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}
