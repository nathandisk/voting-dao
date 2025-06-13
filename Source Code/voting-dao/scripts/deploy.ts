import { ethers } from "hardhat";
import { Identity } from "@semaphore-protocol/identity";
import { Group } from "@semaphore-protocol/group";
import * as dotenv from "dotenv";
dotenv.config();

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // --- FIX: Use the same logic as in the test ---

  // 1. Define an identical list of identity secrets
  const identitySecrets = [
      "secret-user-1-!@#$", "secret-user-2-!@#$",
      "secret-user-3-!@#$", "secret-user-4-!@#$",
      "secret-user-5-!@#$", "secret-user-6-!@#$",
      "secret-user-7-!@#$", "secret-user-8-!@#$",
      "secret-user-9-!@#$", "secret-user-10-!@#$"
  ];
  
  const group = new Group();
  const identities: Identity[] = [];

  for (const secret of identitySecrets) {
    const id = new Identity(secret);
    identities.push(id);
    group.addMember(id.commitment);
  }

  // 2. Calculate the actual Merkle Root
  const actualMerkleRoot = group.root;
  
  console.log("✅ Actual Merkle Root calculated:", actualMerkleRoot.toString());
  
  // Option: Print the commitments again to ensure synchronization
  const memberCommitments = identities.map(id => id.commitment.toString());
  console.log("\n📋 Member commitments for this deployment:\n");
  console.log(JSON.stringify(memberCommitments, null, 2));
  console.log("\n");

  // Deploy verifier contract
  const VerifierFactory = await ethers.getContractFactory("SemaphoreVerifier");
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log("✅ SemaphoreVerifier deployed to:", verifierAddress);

  // Deploy DAO contract
  const DAOFactory = await ethers.getContractFactory("PrivacyVotingDAOv2");
  
  // 3. Deploy DAO contract with the correct Merkle Root
  const dao = await DAOFactory.deploy(
    verifierAddress,
    actualMerkleRoot, // Use the actual root, not a dummy
    ethers.ZeroAddress
  );
  await dao.waitForDeployment();
  const daoAddress = await dao.getAddress();

  console.log("\n====================================================");
  console.log("✅ PrivacyVotingDAOv2 deployed to:", daoAddress);
  console.log("!!! IMPORTANT: Copy the contract address above and update DAO_ADDRESS in your App.tsx.");
  console.log("====================================================\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
