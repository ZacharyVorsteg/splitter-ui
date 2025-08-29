// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/finance/PaymentSplitter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract PaymentSplitterFactory {
    event SplitterDeployed(address indexed splitter, address indexed owner, address[] payees, uint256[] shares);

    function createSplitter(address[] memory payees, uint256[] memory shares)
        external
        returns (address splitter)
    {
        require(payees.length == shares.length && payees.length > 0, "bad arrays");
        PaymentSplitter ps = new PaymentSplitter(payees, shares);
        splitter = address(ps);
        emit SplitterDeployed(splitter, msg.sender, payees, shares);
    }

    function releaseAll(address splitter, address[] calldata payees) external {
        PaymentSplitter ps = PaymentSplitter(payable(splitter));
        for (uint256 i = 0; i < payees.length; i++) {
            ps.release(payable(payees[i]));
        }
    }

    function releaseAllERC20(address splitter, address token, address[] calldata payees) external {
        PaymentSplitter ps = PaymentSplitter(payable(splitter));
        IERC20 erc20 = IERC20(token);
        for (uint256 i = 0; i < payees.length; i++) {
            ps.release(erc20, payees[i]);
        }
    }

    function releasableNative(address splitter, address account) external view returns (uint256) {
        return PaymentSplitter(payable(splitter)).releasable(account);
    }

    function releasableERC20(address splitter, address token, address account) external view returns (uint256) {
        return PaymentSplitter(payable(splitter)).releasable(IERC20(token), account);
    }
}
