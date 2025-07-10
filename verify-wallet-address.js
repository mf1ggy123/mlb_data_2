const { Wallet } = require('ethers');

// Private key from .env.local file
const privateKey = '0x4eeb7f9c0d35fa958304615c123c3e0a9df36c10ecf01c3d3d31f5a73a4d91b9';

console.log('=== Wallet Address Verification ===');
console.log('');

try {
    // Create wallet instance with the private key
    const wallet = new Wallet(privateKey);
    
    // Log the wallet information
    console.log('Private Key:', privateKey);
    console.log('Wallet Address:', wallet.address);
    console.log('Public Key:', wallet.publicKey);
    console.log('');
    console.log('✅ Wallet created successfully!');
    console.log('');
    console.log('To verify this address:');
    console.log('1. Check if this address matches your expected wallet address');
    console.log('2. You can use this address to receive funds on Ethereum/Polygon networks');
    console.log('3. The address should be a 42-character string starting with "0x"');
    
} catch (error) {
    console.error('❌ Error creating wallet:', error.message);
    console.error('');
    console.error('Possible issues:');
    console.error('- Invalid private key format');
    console.error('- Missing ethers dependency');
}