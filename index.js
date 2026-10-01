const express = require('express');
const { ethers } = require('ethers');
const app = express();
app.use(express.json());

const tokenAddress = "0xB0cea145750E76Ccb24a0007206f2485dd5bf21a";
const privateKey = process.env.ADMIN_PRIVATE_KEY; // Render ke Environment Variables se aayega
const rpcUrl = "https://polygon-rpc.com";

app.post('/plisio-webhook', async (req, res) => {
    const paymentData = req.body;

    if (paymentData.status === 'completed') {
        const buyerWallet = paymentData.order_number; 
        const tokensToSend = ethers.utils.parseUnits("100", 18); // Jitne DLC tokens dene hain

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