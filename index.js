const express = require('express');
const { ethers } = require('ethers');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const tokenAddress = "0xB0cea145750E76Ccb24a0007206f2485dd5bf21a";
const privateKey = process.env.ADMIN_PRIVATE_KEY;
const rpcUrl = "https://polygon-rpc.com";
const PLISIO_API_KEY = "KzXe3YIlDFKdub0CG7n8vOv7WYfYhj_hcOjf90-QhuuhmaATJePAUR7A_N-NQ6eG";

// Track total sold tokens
let totalTokensSold = 0; 

function getCurrentRate() {
    const blocks = Math.floor(totalTokensSold / 100);
    return 1.0 * Math.pow(1.00001, blocks);
}

// Create Invoice Route
app.all('/create-plisio-invoice', async (req, res) => {
    try {
        const walletAddress = req.body.wallet_address || req.query.wallet_address || "PENDING_WALLET";
        const currentRate = getCurrentRate();
        const invoiceUSD = currentRate.toFixed(4);

        const params = new URLSearchParams({
            source_currency: 'USD',
            source_amount: invoiceUSD,
            order_name: 'Delta Coin DLC Purchase',
            order_number: walletAddress,
            currency: 'USDT_TON',
            api_key: PLISIO_API_KEY,
            callback_url: 'https://dlc-webhook.onrender.com/plisio-webhook',
            success_url: 'https://delta-fund.github.io/',
            fail_url: 'https://delta-fund.github.io/#buy',
            return_existing: '1'
        });

        const response = await fetch(`https://plisio.net/api/v1/invoices/new?${params.toString()}`);
        const data = await response.json();

        if (data.status === 'success' && data.data?.invoice_url) {
            return res.redirect(data.data.invoice_url);
        } else {
            console.error("Plisio Error:", data);
            return res.status(400).send("Plisio Error: " + JSON.stringify(data));
        }
    } catch (err) {
        console.error("Server Error:", err);
        res.status(500).send("Internal Server Error");
    }
});

// Webhook Route
app.post('/plisio-webhook', async (req, res) => {
    const payment = req.body;

    if (payment.status === 'completed') {
        const buyerWallet = payment.order_number; 
        const paidUSD = parseFloat(payment.source_amount || "1");
        const rate = getCurrentRate();
        const tokensToGive = (paidUSD / rate).toFixed(4);

        try {
            const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
            const wallet = new ethers.Wallet(privateKey, provider);
            const contract = new ethers.Contract(tokenAddress, ["function transfer(address to, uint256 amount) public returns (bool)"], wallet);

            const tx = await contract.transfer(buyerWallet, ethers.utils.parseUnits(tokensToGive, 18));
            await tx.wait();

            totalTokensSold += parseFloat(tokensToGive);
            console.log(`Sent ${tokensToGive} DLC to ${buyerWallet}`);
        } catch (err) {
            console.error("Transfer Error:", err);
        }
    }
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
