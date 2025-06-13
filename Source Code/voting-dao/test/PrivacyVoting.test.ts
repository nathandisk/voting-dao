import { expect } from "chai";
import { ethers } from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import { generateProof, SemaphoreProof } from "@semaphore-protocol/proof";
import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables from .env file
dotenv.config();

/**
 * Packs the proof from a bigint array format into a flat 8-element array compatible with Solidity.
 * The smart contract verifier expects a specific order of elements.
 * @param proof Semaphore proof in bigint array format.
 * @returns Proof formatted as a flat string array [8] to be sent to the smart contract.
 */
function packToSolidityProof(proof: bigint[]): string[] {
  // Ensure the received 'proof' argument is valid and has 8 elements.
  if (!proof || proof.length !== 8) {
    throw new Error(
      "Function packToSolidityProof received an invalid 'proof' argument!"
    );
  } // The verifier contract expects elements 'b' to have their positions swapped. // Correct order for the verifier: [a.x, a.y, b.x.y, b.x.x, b.y.y, b.y.x, c.x, c.y]
  return [
    proof[0].toString(),
    proof[1].toString(),
    proof[3].toString(), // b.x.y swapped with b.x.x
    proof[2].toString(), // b.x.x swapped with b.x.y
    proof[5].toString(), // b.y.y swapped with b.y.x
    proof[4].toString(), // b.y.x swapped with b.y.y
    proof[6].toString(),
    proof[7].toString(),
  ];
}

// Main test block for the 'PrivacyVotingDAOv2' contract.
describe("PrivacyVotingDAOv2", function () {
  // --- INITIAL CONFIGURATION ---
  // Define path to ZK-SNARK circuit files (wasm and zkey) required to generate proof.
  const wasmFilePath = path.resolve(
    process.env.VERIFIER_WASM_PATH || "./circuits/semaphore.wasm"
  );
  const zkeyFilePath = path.resolve(
    process.env.VERIFIER_ZKEY_PATH || "./circuits/semaphore.zkey"
  );
  // Specify Merkle Tree depth, which limits the maximum number of group members.
  const merkleTreeDepth = parseInt(process.env.MERKLE_TREE_DEPTH || "20");

  // --- GLOBAL VARIABLES FOR TESTING ---
  // Variables to store DAO and Verifier contract instances.
  let dao: any;
  let verifier: any;

  // Variables to store Semaphore group and member identities.
  let group: Group;
  let identities: Identity[]; // --- IMPROVEMENT: Using 10 fixed identities for test consistency ---
  // List of secrets to be used for creating unique identities.
  // In real applications, this should be kept private by each user.
  const identitySecrets = [
    "secret-user-1-!@#$",
    "secret-user-2-!@#$",
    "secret-user-3-!@#$",
    "secret-user-4-!@#$",
    "secret-user-5-!@#$",
    "secret-user-6-!@#$",
    "secret-user-7-!@#$",
    "secret-user-8-!@#$",
    "secret-user-9-!@#$",
    "secret-user-10-!@#$",
  ]; // The `before` block runs once before all test scenarios inside `describe` are executed.

  // Its purpose is to perform the initial setup needed by all tests.
  before(async function () {
    // Reinitialize the group and identity list to ensure each test suite starts from a clean state.
    group = new Group();
    identities = [];

    // Verify the existence of circuit files.
    if (!fs.existsSync(wasmFilePath))
      throw new Error(`WASM file not found at: ${wasmFilePath}`);
    if (!fs.existsSync(zkeyFilePath))
      throw new Error(`ZKEY file not found at: ${zkeyFilePath}`);

    // Create identity objects from each secret and add them to the group.
    for (const secret of identitySecrets) {
      const id = new Identity(secret);
      identities.push(id);
      // 'commitment' is the public representation of the identity and safe to share.
      group.addMember(id.commitment);
    }

    console.log(
      `✅ ${identitySecrets.length} fixed identities successfully created.`
    );
    // Print Merkle Tree root. This root will be used when deploying the DAO contract
    // to define the set of valid members.
    console.log("✅ Group Merkle Root (CONSISTENT):", group.root.toString());
    // Print the list of member commitments for easy copy-paste to frontend.
    const memberCommitments = identities.map((id) => id.commitment.toString());
    console.log(
      "\n📋 COPY THIS LIST OF COMMITMENTS (10 MEMBERS) TO YOUR FRONTEND:\n"
    );
    console.log(JSON.stringify(memberCommitments, null, 2));
    console.log("\n");
    // Deploy Verifier contract responsible for verifying ZK-SNARK proofs.
    const VerifierFactory = await ethers.getContractFactory(
      "SemaphoreVerifier"
    );
    verifier = await VerifierFactory.deploy();
    await verifier.waitForDeployment();
    console.log(
      `✅ SemaphoreVerifier successfully deployed at address: ${await verifier.getAddress()}`
    );

    // Deploy the main contract, PrivacyVotingDAOv2.
    // Verifier address and group root are passed as constructor arguments.
    const DAOFactory = await ethers.getContractFactory("PrivacyVotingDAOv2");
    dao = await DAOFactory.deploy(
      await verifier.getAddress(),
      group.root, // Root of the Merkle Tree containing all valid members.
      ethers.ZeroAddress // Token address (if any, not used here).
    );
    await dao.waitForDeployment();
    console.log(
      `✅ PrivacyVotingDAOv2 successfully deployed at address: ${await dao.getAddress()}`
    );
  }); // --- Scenario 1: Test Voting on Yes/No Proposal ---

  it("Should allow 5 members to vote on a Yes/No proposal", async function () {
    // Extend test execution time since proof generation may take time.
    this.timeout(120000);
    const [owner] = await ethers.getSigners(); // Create a new Yes/No type proposal.
    const proposalId = 1;
    const options = ["Yes", "No"];
    await dao
      .connect(owner)
      .createProposal(
        "Proposal Yes/No",
        "Description for Yes/No proposal",
        0,
        options,
        300
      );
    console.log(
      `\n--- Scenario 1: Yes/No Proposal (ID: ${proposalId}) Created ---`
    ); // Simulate voting by the first 5 members.

    for (let i = 0; i < 5; i++) {
      const voterIdentity = identities[i];
      // Randomly choose option (0 for "Yes", 1 for "No").
      const optionIndex = Math.round(Math.random());

      // 'signal' is the message the voter wants to broadcast. Here, it denotes their choice.
      const signal = `VOTE_${optionIndex}`;
      // Hash the signal for privacy.
      const signalHash = BigInt(
        ethers.solidityPackedKeccak256(["string"], [signal])
      );
      // 'externalNullifier' ensures the proof is only valid for this specific proposal, preventing replay attacks.
      const externalNullifier = BigInt(proposalId);

      // Generate ZK-SNARK proof proving group membership without revealing identity.
      const fullProof = await generateProof(
        voterIdentity,
        group,
        externalNullifier,
        signalHash,
        merkleTreeDepth,
        { wasm: wasmFilePath, zkey: zkeyFilePath }
      );
      // Extract proof data and pack it into the format accepted by the smart contract.
      const proofData = (fullProof as any).points.map((p: string) => BigInt(p));
      const solidityProof = packToSolidityProof(proofData);

      // ADDING LOG TO DISPLAY PROOF
      console.log(
        `📦 Solidity Proof for Member ${i + 1} (Proposal ID ${proposalId}):`,
        solidityProof
      );

      // Submit vote transaction to smart contract with all required data.
      await dao.vote(
        proposalId,
        optionIndex,
        fullProof.scope,
        fullProof.nullifier,
        fullProof.merkleTreeRoot,
        solidityProof
      );
      console.log(
        `🗳️  Member ${
          i + 1
        } voted for: "${options[optionIndex]}" on Proposal ID ${proposalId}`
      );
    }

    // After voting, retrieve the vote tally from the contract.
    const tallies = await dao.tallies(proposalId, 0, options.length);
    // Sum up total votes.
    const totalVotes = tallies.reduce(
      (sum: bigint, current: bigint) => sum + current,
      BigInt(0)
    );
    console.log(
      `\n📊 Result for Proposal ID ${proposalId}: Yes: ${tallies[0]}, No: ${tallies[1]}`
    );
    // Verify that the recorded total votes match the number of participants.
    expect(totalVotes).to.equal(BigInt(5));
    console.log(
      `✅ Scenario 1 Verification Successful: Total votes (${totalVotes}) match the number of voters (5).`
    );
  }); // --- Scenario 2: Test Voting on Multiple Choice Proposal ---

  it("Should allow the other 5 members to vote on a Multiple Choice proposal", async function () {
    this.timeout(120000);
    const [owner] = await ethers.getSigners(); // Create a new Multiple Choice type proposal.
    const proposalId = 2;
    const options = ["Option A", "Option B", "Option C", "Option D"];
    await dao
      .connect(owner)
      .createProposal(
        "Multiple Choice Proposal",
        "Description for multiple choice",
        0,
        options,
        300
      );
    console.log(
      `\n--- Scenario 2: Multiple Choice Proposal (ID: ${proposalId}) Created ---`
    ); // Simulate voting by the next 5 members (index 5 through 9).

    for (let i = 5; i < 10; i++) {
      const voterIdentity = identities[i];
      // Randomly select an option from the 4 available choices.
      const optionIndex = Math.floor(Math.random() * options.length);

      // Proof and signal generation process is the same as Scenario 1.
      const signal = `VOTE_${optionIndex}`;
      const signalHash = BigInt(
        ethers.solidityPackedKeccak256(["string"], [signal])
      );
      const externalNullifier = BigInt(proposalId);

      const fullProof = await generateProof(
        voterIdentity,
        group,
        externalNullifier,
        signalHash,
        merkleTreeDepth,
        { wasm: wasmFilePath, zkey: zkeyFilePath }
      );
      const proofData = (fullProof as any).points.map((p: string) => BigInt(p));
      const solidityProof = packToSolidityProof(proofData);

      // ADDING LOG TO DISPLAY PROOF
      console.log(
        `📦 Solidity Proof for Member ${i + 1} (Proposal ID ${proposalId}):`,
        solidityProof
      );

      // Submit vote transaction.
      await dao.vote(
        proposalId,
        optionIndex,
        fullProof.scope,
        fullProof.nullifier,
        fullProof.merkleTreeRoot,
        solidityProof
      );
      console.log(
        `🗳️  Member ${
          i + 1
        } voted for: "${options[optionIndex]}" on Proposal ID ${proposalId}`
      );
    }

    // Retrieve and verify vote tally.
    const tallies = await dao.tallies(proposalId, 0, options.length);
    const totalVotes = tallies.reduce(
      (sum: bigint, current: bigint) => sum + current,
      BigInt(0)
    );

    console.log(
      `\n📊 Result for Proposal ID ${proposalId}: A: ${tallies[0]}, B: ${tallies[1]}, C: ${tallies[2]}, D: ${tallies[3]}`
    );
    // Verify total votes.
    expect(totalVotes).to.equal(BigInt(5));
    console.log(
      `✅ Scenario 2 Verification Successful: Total votes (${totalVotes}) match the number of voters (5).`
    );
  });
});
