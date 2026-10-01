const express = require('express');
const { ethers } = require('ethers');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const tokenAddress = "0xB0cea145750E76Ccb24a0007206f2485dd5bf21a";
const privateKey = process.env.ADMIN_PRIVATE_KEY;
const rpcUrl = "https://polygon-rpc.com";
const PLISIO_API_KEY = "KzXe3YIlDFKdub0CG7n8vOv7WYfYhj_hcOjf90-QhuuhmaATJePAUR7A_N-NQ6eG";

let totalTokensSold = 0; 

function getCurrentRate() {
    const blocks = Math.floor(totalTokensSold / 100);
    const baseRate = 1.0; 
    return baseRate * Math.pow(1.00001, blocks);
}

// 1. Direct Link Generator (/get-link)
app.all('/get-link', async (req, res) => {
    try {
        const walletAddress = req.query.wallet || "PENDING_WALLET";
        const currentRate = getCurrentRate();
        
        // Minimum amount ko Plisio ke rule ke mutabiq kam se kam 5 USD ya usse zyada rakha hai
        let invoiceUSD = (5 * currentRate).toFixed(4); 

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
            return res.json({ 
                success: true, 
                payment_link: data.data.invoice_url,
                total_usd: invoiceUSD 
            });
        } else {
            return res.status(400).json({ success: false, error: data });
        }
    } catch (err) {
        console.error("Link Gen Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 2. Standard Invoice Creation Route (/create-plisio-invoice)
app.all('/create-plisio-invoice', async (req, res) => {
    try {
        const walletAddress = req.body.wallet_address || req.query.wallet_address || "PENDING_WALLET";
        const currentRate = getCurrentRate();
        let invoiceUSD = (5 * currentRate).toFixed(4); // Minimum 5 USD for USDT_TON

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
            return res.status(400).send("Plisio Error: " + JSON.stringify(data));
        }
    } catch (err) {
        res.status(500).send("Internal Server Error");
    }
});

// 3. Webhook Route (Token dispatch)
app.post('/plisio-webhook', async (req, res) => {
    const payment = req.body;

    if (payment.status === 'completed') {
        const buyerWallet = payment.order_number; 
        const paidUSD = parseFloat(payment.source_amount || "5");
        const rate = getCurrentRate();
        
        // Jitna USD pay hoga, uske hisab se tokens calculate honge (e.g. 5 USD / rate)
        const tokensToGive = (paidUSD / rate).toFixed(4);

        try {
            const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
            const wallet = new ethers.Wallet(privateKey, provider);
            const contract = new ethers.Contract(tokenAddress, ["function transfer(address to, uint256 amount) public returns (bool)"], wallet);

            const tx = await contract.transfer(buyerWallet, ethers.utils.parseUnits(tokensToGive, 18));
            await tx.wait();

            totalTokensSold += parseFloat(tokensToGive);
            console.log(`Successfully sent ${tokensToGive} DLC tokens to ${buyerWallet}`);
        } catch (err) {
            console.error("Transfer Error:", err);
        }
    }
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Server running on port ' + PORT));
