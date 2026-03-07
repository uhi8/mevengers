const { keccak256, toHex, stringToBytes } = require("viem");

const errors = [
    "OnlySentinelOrOwner()",
    "AuctionNotActive()",
    "BidTooLow()",
    "PoolNotLocked()"
];

errors.forEach(err => {
    // Generate selector correctly using keccak256 of the signature string
    const selector = keccak256(Buffer.from(err)).substring(0, 10);
    console.log(`${err}: ${selector}`);
});
