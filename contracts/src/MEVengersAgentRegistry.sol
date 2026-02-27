// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/**
 * @title MEVengersAgentRegistry
 * @notice ERC-8004 compliant on-chain registry for AI Agents and Human Guardians
 *         participating in the MEVengers ecosystem.
 *
 * @dev ERC-8004 defines:
 *      - Identity: An NFT that represents an agent/guardian's on-chain persona
 *      - Reputation: A feedback mechanism where the ecosystem records agent performance
 *
 * What makes MEVengers unique vs Aegis is that our AI Agent ITSELF registers here.
 * When our off-chain AI correctly predicts an MEV attack, the Reactive Sentinel
 * calls `giveFeedback()` to record the successful prediction on-chain, building
 * the AI Agent's verifiable reputation over time.
 */
contract MEVengersAgentRegistry is Ownable, ERC721URIStorage {

    // ─── Identity Storage ──────────────────────────────────────────
    uint256 private _nextAgentId = 1;
    mapping(address => uint256) public addressToAgentId;
    mapping(uint256 => address) public agentIdToAddress;

    // ─── Agent Type ────────────────────────────────────────────────
    enum AgentType { Human, AI }
    mapping(uint256 => AgentType) public agentType;

    // ─── Reputation Storage ────────────────────────────────────────
    struct Feedback {
        address client;         // Who gave feedback (Hook or Sentinel)
        int128 value;           // Positive = successful MEV block, Negative = false positive
        uint8 valueDecimals;
        string tag1;            // e.g. "mev_block", "reputation_update"
        string tag2;            // e.g. "pre_emptive", "reactive", "false_positive"
        uint64 timestamp;
    }

    mapping(uint256 => Feedback[]) public agentFeedback;

    // ─── ERC-8004 Events ───────────────────────────────────────────
    event Registered(
        uint256 indexed agentId,
        AgentType agentType,
        string agentURI,
        address indexed owner
    );

    event NewFeedback(
        uint256 indexed agentId,
        address indexed agentAddress,   // For Reactive Sentinel cross-chain filtering
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string tag1,
        string tag2,
        string endpoint,
        string feedbackURI,
        bytes32 feedbackHash
    );

    // ─── Authorised Callers ────────────────────────────────────────
    /// @notice The MEVengersHook and MEVAuctionSentinel can give feedback autonomously
    mapping(address => bool) public authorisedCallers;

    // ─── Constructor ───────────────────────────────────────────────
    constructor() Ownable(msg.sender) ERC721("MEVengers Agent", "MVAG") {}

    // ─── Admin ─────────────────────────────────────────────────────

    function setAuthorisedCaller(address caller, bool allowed) external onlyOwner {
        authorisedCallers[caller] = allowed;
    }

    // ─── Identity Functions ────────────────────────────────────────

    /**
     * @notice Register a Human Guardian or AI Agent with an on-chain identity NFT.
     * @param _agentURI Metadata URI describing the agent (name, type, model, etc.)
     * @param _type     AgentType.Human or AgentType.AI
     */
    function register(string calldata _agentURI, AgentType _type) external returns (uint256) {
        require(addressToAgentId[msg.sender] == 0, "Already registered");

        uint256 agentId = _nextAgentId++;
        _mint(msg.sender, agentId);
        _setTokenURI(agentId, _agentURI);

        addressToAgentId[msg.sender] = agentId;
        agentIdToAddress[agentId] = msg.sender;
        agentType[agentId] = _type;

        emit Registered(agentId, _type, _agentURI, msg.sender);
        return agentId;
    }

    function getAgentId(address _addr) external view returns (uint256) {
        return addressToAgentId[_addr];
    }

    // ─── Reputation Functions (ERC-8004) ───────────────────────────

    /**
     * @notice Records performance feedback for an agent.
     *
     * Called by:
     * - MEVengersHook: after auction settlement to reward winning Guardian
     * - MEVAuctionSentinel (via Reactive callback): to reward the AI Agent for
     *   correct pre-emptive MEV prediction
     *
     * @param agentId       The agent's NFT id
     * @param value         Positive = successful action, Negative = false positive/slashed
     * @param valueDecimals Decimal precision of value
     * @param tag1          Action type e.g. "mev_block", "auction_win"
     * @param tag2          Sub-type e.g. "pre_emptive_ai", "human_guardian"
     * @param endpoint      Optional off-chain endpoint for extended proof
     * @param feedbackURI   Optional IPFS URI with full evidence
     * @param feedbackHash  Hash of the proof data
     */
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        require(authorisedCallers[msg.sender] || msg.sender == owner(), "Not authorised");
        require(_ownerOf(agentId) != address(0), "Agent not found");

        Feedback memory fb = Feedback({
            client: msg.sender,
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            timestamp: uint64(block.timestamp)
        });

        agentFeedback[agentId].push(fb);
        uint64 index = uint64(agentFeedback[agentId].length - 1);

        emit NewFeedback(
            agentId,
            agentIdToAddress[agentId],
            msg.sender,
            index,
            value,
            valueDecimals,
            tag1,
            tag2,
            endpoint,
            feedbackURI,
            feedbackHash
        );
    }

    /**
     * @notice Convenience function: give feedback using agent wallet address instead of ID.
     *         Called by the Reactive Sentinel to reward the AI agent without ID lookups.
     */
    function giveFeedbackByAddress(
        address agentAddress,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external {
        require(authorisedCallers[msg.sender] || msg.sender == owner(), "Not authorised");
        uint256 agentId = addressToAgentId[agentAddress];
        require(agentId > 0, "Agent not registered");

        this.giveFeedback(agentId, value, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    }

    // ─── Aggregation Views ─────────────────────────────────────────

    function getFeedbackCount(uint256 agentId) external view returns (uint256) {
        return agentFeedback[agentId].length;
    }

    /// @notice Computes the net reputation score (sum of all feedback values)
    function getNetReputation(uint256 agentId) external view returns (int128 total) {
        Feedback[] storage feeds = agentFeedback[agentId];
        for (uint256 i = 0; i < feeds.length; i++) {
            total += feeds[i].value;
        }
    }

    /// @notice Returns volume of successfully blocked MEV (for AI Agents)
    function getMEVBlockedVolume(uint256 agentId) external view returns (int128 total) {
        Feedback[] storage feeds = agentFeedback[agentId];
        for (uint256 i = 0; i < feeds.length; i++) {
            if (keccak256(bytes(feeds[i].tag1)) == keccak256(bytes("mev_block"))) {
                total += feeds[i].value;
            }
        }
    }

    // ─── ERC-721 Overrides ─────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override(ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
