// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/finance/PaymentSplitter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PaymentSplitterFactory {
    event SplitterDeployed(
        address indexed splitter,
        address indexed owner,
        string name,
        address[] payees,
        uint256[] shares
    );

    struct SplitterInfo {
        address splitter;
        address owner;
        string name;
        address[] payees;
        uint256[] shares;
        uint256 createdAt;
    }

    mapping(address => SplitterInfo[]) public ownerSplitters;
    mapping(address => SplitterInfo) public splitterInfo;
    address[] public allSplitters;

    /// @notice Deploys a fresh OpenZeppelin PaymentSplitter with metadata
    /// @param name Human-readable name for the splitter
    /// @param payees Array of recipient addresses
    /// @param shares Array of share weights (BPS work fine: 5000,5000 = 50/50)
    function createSplitter(
        string memory name,
        address[] memory payees, 
        uint256[] memory shares
    ) external returns (address splitter) {
        require(payees.length == shares.length && payees.length > 0, "Invalid arrays");
        require(bytes(name).length > 0, "Name required");
        
        // Validate shares sum to something reasonable
        uint256 totalShares = 0;
        for (uint256 i = 0; i < shares.length; i++) {
            require(payees[i] != address(0), "Invalid payee address");
            require(shares[i] > 0, "Share must be > 0");
            totalShares += shares[i];
        }
        require(totalShares > 0, "Total shares must be > 0");

        PaymentSplitter ps = new PaymentSplitter(payees, shares);
        splitter = address(ps);

        // Store metadata
        SplitterInfo memory info = SplitterInfo({
            splitter: splitter,
            owner: msg.sender,
            name: name,
            payees: payees,
            shares: shares,
            createdAt: block.timestamp
        });

        ownerSplitters[msg.sender].push(info);
        splitterInfo[splitter] = info;
        allSplitters.push(splitter);

        emit SplitterDeployed(splitter, msg.sender, name, payees, shares);
    }

    /// @notice Get all splitters created by an owner
    function getOwnerSplitters(address owner) external view returns (SplitterInfo[] memory) {
        return ownerSplitters[owner];
    }

    /// @notice Get total number of splitters deployed
    function getTotalSplitters() external view returns (uint256) {
        return allSplitters.length;
    }

    /// --- Convenience batch operations ---

    /// @notice Release native token (ETH/MATIC) to all payees
    function releaseAll(address splitter, address[] calldata payees) external {
        PaymentSplitter ps = PaymentSplitter(payable(splitter));
        for (uint256 i = 0; i < payees.length; i++) {
            if (ps.releasable(payees[i]) > 0) {
                ps.release(payable(payees[i]));
            }
        }
    }

    /// @notice Release ERC20 tokens to all payees
    function releaseAllERC20(address splitter, address token, address[] calldata payees) external {
        PaymentSplitter ps = PaymentSplitter(payable(splitter));
        IERC20 erc20 = IERC20(token);
        for (uint256 i = 0; i < payees.length; i++) {
            if (ps.releasable(erc20, payees[i]) > 0) {
                ps.release(erc20, payees[i]);
            }
        }
    }

    /// --- View functions for UI ---

    /// @notice Check releasable native token for an account
    function releasableNative(address splitter, address account) external view returns (uint256) {
        return PaymentSplitter(payable(splitter)).releasable(account);
    }

    /// @notice Check releasable ERC20 tokens for an account
    function releasableERC20(address splitter, address token, address account) external view returns (uint256) {
        return PaymentSplitter(payable(splitter)).releasable(IERC20(token), account);
    }

    /// @notice Get splitter balance (native token)
    function getSplitterBalance(address splitter) external view returns (uint256) {
        return splitter.balance;
    }

    /// @notice Get splitter ERC20 balance
    function getSplitterERC20Balance(address splitter, address token) external view returns (uint256) {
        return IERC20(token).balanceOf(splitter);
    }

    /// @notice Check if address is a valid splitter from this factory
    function isValidSplitter(address splitter) external view returns (bool) {
        return splitterInfo[splitter].splitter != address(0);
    }
}
