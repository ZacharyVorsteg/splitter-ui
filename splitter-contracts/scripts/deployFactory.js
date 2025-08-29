import { ethers } from "hardhat";

async function main() {
  const Factory = await ethers.getContractFactory("PaymentSplitterFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  console.log("Factory deployed at:", await factory.getAddress());
}
main().catch((e)=>{ console.error(e); process.exit(1); });
