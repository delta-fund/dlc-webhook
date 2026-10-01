const express = require('express');
const { ethers } = require('ethers');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const tokenAddress = "0xB0cea145750E76Ccb24a0007206f2485dd5bf21a";
const privateKey = process.env.ADMIN_PRIVATE_KEY;
const rpcUrl = "https://polygon-rpc.com";
const PLISIO_API_KEY = "KzXe3YIlDFKdub0CG7n8vOv7WYfYhj_hcOjf90-QhuuhmaATJePAUR7A_N-NQ6eG";

// Track total sold tokens for dynamic pricing
let totalTokensSold = 0; 

// Function to calculate current rate (Increases by 0.001% for every 100 DLC sold)
function getCurrentRate() {
    const blocks = Math.floor(totalTokensSold / 100);
    const baseRate = 1.0; // Base rate: 1 DLC = 1 USD
    return baseRate * Math.pow(1.00001, blocks);
}

// 1. Route to create Plisio Invoice (Supports both GET and POST requests)
app.all('/create-plisio-invoice', async (req, res) => {
    try {
        const walletAddress = req.body.wallet_address || req.query.wallet_address || "PENDING_WALLET_CONNECT";
        
        // Calculate invoice USD amount based on current dynamic rate
        const currentRate = getCurrentRate();
        const invoiceUSD = (1 * currentRate).toFixed(4);

        const params = new URLSearchParams({
            source_currency: 'USD',
            source_amount: invoiceUSD.toString(),
            order_name: 'Delta Coin DLC Purchase',
            order_number: walletAddress,
            currency: 'USDT_TON',
            api_key: PLISIO_API_KEY,
            callback_url: 'https://dlc-webhook.onrender.com/plisio-webhook',
            success_url: 'https://delta-fund.github.io/',
            fail_url: 'https://delta-fund.github.io/#buy',
            return_existing: '1'
        });

        const plsResponse = await fetch(`https://plisio.net/api/v1/invoices/new?${params.toString()}`);
        const plsData = await plsResponse.json();

        if (plsData.status === 'success' && plsData.data && plsData.data.invoice_url) {
            return res.redirect(plsData.data.invoice_url);
        } else {
            console.error("Plisio Error Response:", plsData);
            return res.status(400).send("Failed to create Plisio invoice. Check server logs.");
        }
    } catch (error) {
        console.error("Invoice creation exception:", error);
        res.status(500).send("Internal Server Error");
    }
});

// 2. Route to handle Plisio Webhook and dispatch tokens upon payment completion
app.post('/plisio-webhook', async (req, res) => {
    const paymentData = req.body;

    if (paymentData.status === 'completed') {
        const buyerWallet = paymentData.order_number; 
        const paidAmountUSD = parseFloat(paymentData.source_amount || "1");
        
        // Calculate tokens to give based on paid USD and current dynamic rate
        const currentRate = getCurrentRate();
        const tokensToGive = (paidAmountUSD / currentRate).toFixed(4);

        const tokensToSend = ethers.utils.parseUnits(tokensToGive.toString(), 18); 

        try {
            const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
            const wallet = new ethers.Wallet(privateKey, provider);
            
            const abi = ["function transfer(address to, uint256 amount) public returns (bool)"];
            const contract = new ethers.Contract(tokenAddress, abi, wallet);

            const tx = await contract.transfer(buyerWallet, tokensToSend);
            await tx.wait();

            // Update total sold tokens to increment the rate for future buyers
            totalTokensSold += parseFloat(tokensToGive);

            console.log(`Successfully sent ${tokensToGive} DLC tokens to: ${buyerWallet}. Total Sold: ${totalTokensSold}`);
        } catch (error) {
            console.error("Token transfer failed: ", error);
        }
    }

    res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Webhook server running on port ' + PORT));
