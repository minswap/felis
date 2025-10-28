import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { NetworkEnvironment } from "@repo/ledger-core";
import { baseAddressWalletFromSeed } from "@repo/cip";
import chalk from "chalk";
import { RustModule } from "@repo/ledger-utils";

const ASK_NETWORK_QUESTION = `
Please select a network:
  1. Mainnet
  2. Preview (Default)
  3. Exit
Which network do you want to use? `;

const ASK_WALLET_QUESTION = `
Please enter your wallet seed phrase: `;

const askNetwork = async (rli: Interface): Promise<NetworkEnvironment> => {
  while (true) {
    const choice = await rli.question(chalk.cyan(ASK_NETWORK_QUESTION));
    // default to "2" if the input is empty (means Preview)
    const normalizedChoice = choice.trim() === "" ? "2" : choice;
    switch (normalizedChoice) {
      case "1":
        console.log(chalk.green("You selected Mainnet."));
        return NetworkEnvironment.MAINNET;
      case "2":
        console.log(chalk.green("You selected Testnet Preview."));
        return NetworkEnvironment.TESTNET_PREVIEW;
      case "3":
        console.info(chalk.yellowBright("Exiting..."));
        process.exit(0);
      default:
        console.error(`Invalid choice: ${choice}`);
    }
  }
};

const askWallet = async (rli: Interface, networkEnv: NetworkEnvironment): Promise<string> => {
  while (true) {
    const seedPhrase = await rli.question(chalk.cyan(ASK_WALLET_QUESTION));
    const normalizedSeedPhrase = seedPhrase.trim();
    try {
      console.log(normalizedSeedPhrase);
      const wallet = baseAddressWalletFromSeed(normalizedSeedPhrase, networkEnv);
      console.log(chalk.green("Wallet generated successfully."));
      console.log(chalk.green(`Address: ${wallet.address.bech32}`));
      return normalizedSeedPhrase;
    } catch (error) {
      console.log(error);
      console.error(chalk.redBright("Failed to generate wallet from the provided seed phrase. Please try again."));
    }
  }
};

const main = async () => {
  await RustModule.load();
  const rli = createInterface({ input, output, terminal: true });
  const networkEnv = await askNetwork(rli);
  const wallet = await askWallet(rli, networkEnv);
};

main();
