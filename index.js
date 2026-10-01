const express = require('express');
const { ethers } = require('ethers');
const fetch = require('node-fetch'); // Agar fetch required ho, ya native fetch use ho raha ho
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const tokenAddress = "0xB0cea145750E76Ccb24a0007206f2485dd5bf21a";
const privateKey = process.env.ADMIN_PRIVATE_KEY;
const rpcUrl = "https://polygon-rpc.com";
const PLISIO_API_KEY = "KzXe3YIlDFKdub0CG7n8vOv7WYfYhj_hcOjf90-QhuuhmaATJePAUR7A_N-NQ6eG";

// 1. Plisio Invoice Create karne ka Route (Frontend se yahan request aayegi)
app.post('/create-plisio-invoice', async (req, res) => {
    try {
        const walletAddress = req.body.wallet_address || "PENDING_WALLET";
        
        const params = new URLSearchParams({
            source_currency: 'USD',
            source_amount: '10',
            order_name: 'Delta Coin DLC Purchase',
            order_number: walletAddress,
            currency: 'USDT_TON',
            api_key: PLISIO_API_KEY,
            callback_url: 'https://dlc-webhook.onrender.com/plisio-webhook',
            success_url: 'https://delta-fund.github.io/',
            fail_url: 'https://delta-fund.github.io/#buy'
        });

        const plsResponse = await fetch(`https://plisio.net/api/v1/invoices/new?${params.toString()}`);
        const plsData = await plsResponse.json();

        if (plsData.status === 'success' && plsData.result && plsData.result.url) {
            // User ko seedha Plisio ke payment page par redirect kar do
            return res.redirect(plsData.result.url);
        } else {
            console.error("Plisio Error Response:", plsData);
            return res.status(400).send("Failed to create Plisio invoice. Check server logs.");
        }
    } catch (error) {
        console.error("Invoice creation exception:", error);
        res.status(500).send("Internal Server Error");
    }
});

// 2. Plisio Webhook Status Listen karne ka Route (Payment complete hone par token dispatch hoga)
app.post('/plisio-webhook', async (req, res) => {
    const paymentData = req.body;

    if (paymentData.status === 'completed') {
        const buyerWallet = paymentData.order_number; 
        const tokensToSend = ethers.utils.parseUnits("100", 18); 

        try {
            const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
            const wallet = new ethers.Wallet(privateKey, provider);
            
            const abi = ["function transfer(address to, uint256 amount) public returns (bool)"];
            const contract = new ethers.Contract(tokenAddress, abi, wallet);

            const tx = await contract.transfer(buyerWallet, tokensToSend);
            await tx.wait();

            console.log("DLC tokens successfully sent to: " + buyerWallet);
        } catch (error) {
            console.error("Token transfer failed: ", error);
        }
    }

    res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Webhook server running on port ' + PORT));
