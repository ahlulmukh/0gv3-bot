import chalk from "chalk";
import { ethers, FetchRequest } from "ethers";
import fs from "fs";
import path from "path";
import { BTC_ABI, ETH_ABI, ROUTER_ABI, USDT_ABI } from "../config/abi";
import { logMessage } from "../utils/logger";
import { getProxyAgent } from "./proxy";

const configPath = path.resolve(__dirname, "../../config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

export class ogBot {
  private privkey: string;
  private web3: any;
  private wallet: ethers.Wallet;
  private swapaddress: string = '0xb95b5953ff8ee5d5d9818cdbefe363ff2191318c';
  private usdtaddress: string = '0x3ec8a8705be1d5ca90066b37ba62c4183b024ebf';
  private ethaddress: string = '0x0fe9b43625fa7edd663adcec0728dd635e4abf7c';
  private btcaddress: string = '0x36f6414ff1df609214ddaba71c84f18bcf00f67d';
  private usdtContract: any;
  private swapContract: any;
  private btcContract: any;
  private ethContract: any;
  private RPC: string;
  private explorer: string;
  private proxy: string | null;
  private currentNum: number;
  private total: number;


  constructor(privkey: string, proxy: string | null = null, currentNum: number, total: number) {
    this.RPC = config.RPC_URL;
    this.explorer = config.EXPLORE_URL;
    this.privkey = privkey;
    this.web3 = this.initializeWeb3();
    this.wallet = new ethers.Wallet(this.privkey, this.web3);
    this.usdtContract = new ethers.Contract(this.usdtaddress, USDT_ABI, this.wallet);
    this.swapContract = new ethers.Contract(this.swapaddress, ROUTER_ABI, this.wallet);
    this.btcContract = new ethers.Contract(this.btcaddress, BTC_ABI, this.wallet);
    this.ethContract = new ethers.Contract(this.ethaddress, ETH_ABI, this.wallet);;
    this.currentNum = currentNum;
    this.total = total
    this.proxy = proxy;
  }


  private initializeWeb3() {
    if (this.proxy) {
      FetchRequest.registerGetUrl(
        FetchRequest.createGetUrlFunc({
          agent: getProxyAgent(this.proxy, this.currentNum, this.total),
        })
      );
      return new ethers.JsonRpcProvider(this.RPC);
    }
    return new ethers.JsonRpcProvider(this.RPC);
  }

  private async approveToken(tokenContract: any, spenderAddress: any, amount: any) {
    logMessage(this.currentNum, this.total, "Trying approval...", "process");
    try {
      const nonce = await this.web3.getTransactionCount(
        this.wallet.address,
        "pending"
      );
      logMessage(this.currentNum, this.total, `Using nonce ${nonce} for approval`, "process");
      const tx = await tokenContract.approve(
        spenderAddress,
        amount,
        {
          nonce,
          gasLimit: 100000,
          gasPrice: (await this.web3.getFeeData()).gasPrice,
        }
      );
      await tx.wait();
      logMessage(this.currentNum, this.total, `Transaction hash : ${tx.hash}`, "success");
      logMessage(this.currentNum, this.total, `BlockHash URL : ${this.explorer}${tx.hash}`, "success");
      console.log(chalk.white("-".repeat(85)));
      return tx.hash;
    } catch (error: any) {
      logMessage(this.currentNum, this.total, `Approval failed: ${error.message}`, "error");
      return null;
    }
  }

  public async autoSwapBtcUsdt() {
    const count = 3;
    for (let i = 0; i < count; i++) {
      const random = Math.random() < 0.5 ? 'USDT->BTC' : 'BTC->USDT';
      const randomUsdt = parseFloat((Math.random() * (2 - 0.5) + 0.5).toFixed(2));
      const randomBtc = parseFloat((Math.random() * (0.0005 - 0.0002) + 0.0002).toFixed(6));
      const usdtBalance = await this.usdtContract.balanceOf(this.wallet.address);
      const btcBalance = await this.btcContract.balanceOf(this.wallet.address);
      const usdtDecimals = await this.usdtContract.decimals();
      const btcDecimals = await this.btcContract.decimals();

      const formattedUsdtBalance = ethers.formatUnits(usdtBalance, usdtDecimals);
      const formattedBtcBalance = ethers.formatUnits(btcBalance, btcDecimals);

      logMessage(this.currentNum, this.total, `Balance Before Swap:`, "info");
      logMessage(this.currentNum, this.total, `USDT Balance: ${formattedUsdtBalance} USDT`, "info");
      logMessage(this.currentNum, this.total, `BTC Balance: ${formattedBtcBalance} BTC`, "info");

      console.log(chalk.white("-".repeat(85)));

      try {
        const tokenToApprove = random === 'USDT->BTC' ? this.usdtContract : this.btcContract;
        const amountToApprove = random === 'USDT->BTC'
          ? ethers.parseUnits(randomUsdt.toString(), 6)
          : ethers.parseUnits(randomBtc.toString(), 8);
        const approveTx = await this.approveToken(tokenToApprove, this.swapaddress, amountToApprove);
        if (!approveTx) return;
        logMessage(this.currentNum, this.total, `Approved ${random === 'USDT->BTC' ? 'USDT' : 'BTC'} token`, "success");
        const deadline = Math.floor(Date.now() / 1000) + 300;
        const swapNonce = await this.web3.getTransactionCount(this.wallet.address, "pending");
        logMessage(this.currentNum, this.total, `Using nonce ${swapNonce} for swap ${random}`, "process");
        const amountIn = random === 'USDT->BTC'
          ? ethers.parseUnits(randomUsdt.toString(), 6)
          : ethers.parseUnits(randomBtc.toString(), 8);
        const swapTx = await this.swapContract.exactInputSingle({
          tokenIn: random === 'USDT->BTC' ? this.usdtaddress : this.btcaddress,
          tokenOut: random === 'BTC->USDT' ? this.usdtaddress : this.btcaddress,
          fee: 3000,
          recipient: this.wallet.address,
          deadline,
          amountIn,
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0,
        }, {
          nonce: swapNonce,
          gasLimit: 1000000,
          gasPrice: (await this.web3.getFeeData()).gasPrice,
        });

        await swapTx.wait();
        logMessage(this.currentNum, this.total, `Swap ${random} successful`, "success");
        logMessage(this.currentNum, this.total, `Amount: ${ethers.formatUnits(amountIn, random === 'USDT->BTC' ? 6 : 8)}`, "success");
        logMessage(this.currentNum, this.total, `Transaction hash: ${swapTx.hash} `, "success");
        logMessage(this.currentNum, this.total, `BlockHash URL: ${this.explorer}${swapTx.hash} `, "success");
        console.log(chalk.white("-".repeat(85)));

      } catch (error: any) {
        logMessage(this.currentNum, this.total, `Auto swap failed: ${error.message} `, "error");
      }
    }
  }

  public async autoSwapEthUsdt() {
    const count = 3;
    for (let i = 0; i < count; i++) {
      const random = Math.random() < 0.5 ? 'USDT->ETH' : 'ETH->USDT';
      const randomUsdt = parseFloat((Math.random() * (2 - 0.5) + 0.5).toFixed(2));
      const randomEth = parseFloat((Math.random() * (0.0005 - 0.0002) + 0.0002).toFixed(6));
      const usdtBalance = await this.usdtContract.balanceOf(this.wallet.address);
      const ethBalance = await this.ethContract.balanceOf(this.wallet.address);
      const usdtDecimals = await this.usdtContract.decimals();
      const ethDecimals = await this.ethContract.decimals();

      const formattedUsdtBalance = ethers.formatUnits(usdtBalance, usdtDecimals);
      const formattedEthBalance = ethers.formatUnits(ethBalance, ethDecimals);

      logMessage(this.currentNum, this.total, `Balance Before Swap:`, "info");
      logMessage(this.currentNum, this.total, `USDT Balance: ${formattedUsdtBalance} USDT`, "info");
      logMessage(this.currentNum, this.total, `ETH Balance: ${formattedEthBalance} ETH`, "info");

      console.log(chalk.white("-".repeat(85)));

      try {
        const tokenToApprove = random === 'USDT->ETH' ? this.usdtContract : this.ethContract;
        const amountToApprove = random === 'USDT->ETH'
          ? ethers.parseUnits(randomUsdt.toString(), 6)
          : ethers.parseUnits(randomEth.toString(), 8);
        const approveTx = await this.approveToken(tokenToApprove, this.swapaddress, amountToApprove);
        if (!approveTx) return;
        logMessage(this.currentNum, this.total, `Approved ${random === 'USDT->ETH' ? 'USDT' : 'ETH'} token`, "success");
        const deadline = Math.floor(Date.now() / 1000) + 300;
        const swapNonce = await this.web3.getTransactionCount(this.wallet.address, "pending");
        logMessage(this.currentNum, this.total, `Using nonce ${swapNonce} for swap ${random}`, "process");
        const amountIn = random === 'USDT->ETH'
          ? ethers.parseUnits(randomUsdt.toString(), 6)
          : ethers.parseUnits(randomEth.toString(), 8);
        const swapTx = await this.swapContract.exactInputSingle({
          tokenIn: random === 'USDT->ETH' ? this.usdtaddress : this.ethaddress,
          tokenOut: random === 'ETH->USDT' ? this.usdtaddress : this.ethaddress,
          fee: 3000,
          recipient: this.wallet.address,
          deadline,
          amountIn,
          amountOutMinimum: 0,
          sqrtPriceLimitX96: 0,
        }, {
          nonce: swapNonce,
          gasLimit: 1000000,
          gasPrice: (await this.web3.getFeeData()).gasPrice,
        });

        await swapTx.wait();
        logMessage(this.currentNum, this.total, `Swap ${random} successful`, "success");
        logMessage(this.currentNum, this.total, `Amount: ${ethers.formatUnits(amountIn, random === 'USDT->ETH' ? 6 : 8)}`, "success");
        logMessage(this.currentNum, this.total, `Transaction hash: ${swapTx.hash} `, "success");
        logMessage(this.currentNum, this.total, `BlockHash URL: ${this.explorer}${swapTx.hash} `, "success");
        console.log(chalk.white("-".repeat(85)));

      } catch (error: any) {
        logMessage(this.currentNum, this.total, `Auto swap failed: ${error.message} `, "error");
      }
    }
  }


}