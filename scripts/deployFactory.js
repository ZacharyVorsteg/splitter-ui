const hre = require("hardhat");

async function main() {
  console.log("🚀 Deploying PaymentSplitterFactory...");
  
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)));

  const Factory = await hre.ethers.getContractFactory("PaymentSplitterFactory");
  
  console.log("⏳ Deploying contract...");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  
  const factoryAddress = await factory.getAddress();
  console.log("✅ PaymentSplitterFactory deployed to:", factoryAddress);
  
  // Verify contract on block explorer (if not local network)
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("⏳ Waiting for block confirmations...");
    await factory.deploymentTransaction().wait(6);
    
    try {
      console.log("📋 Verifying contract on block explorer...");
      await hre.run("verify:verify", {
        address: factoryAddress,
        constructorArguments: [],
      });
      console.log("✅ Contract verified!");
    } catch (error) {
      console.log("⚠️ Verification failed:", error.message);
    }
  }

  console.log("\n📋 Deployment Summary:");
  console.log("Network:", hre.network.name);
  console.log("Factory Address:", factoryAddress);
  console.log("Deployer:", deployer.address);
  console.log("Gas Used:", (await factory.deploymentTransaction().wait()).gasUsed.toString());

  // Save deployment info
  const fs = require('fs');
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    factoryAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    blockNumber: (await factory.deploymentTransaction().wait()).blockNumber
  };

  fs.writeFileSync(
    `deployments/${hre.network.name}-factory.json`, 
    JSON.stringify(deploymentInfo, null, 2)
  );
  
  console.log(`💾 Deployment info saved to deployments/${hre.network.name}-factory.json`);
}

main().catch((error) => {
  console.error("❌ Deployment failed:", error);
  process.exit(1);
});
