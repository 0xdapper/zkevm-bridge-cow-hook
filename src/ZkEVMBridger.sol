import {ERC20} from "solmate/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/utils/SafeTransferLib.sol";

interface IZkEVMBridge {
    function bridgeAsset(
        uint32 destinationNetwork,
        address destinationAddress,
        uint256 amount,
        address token,
        bool forceUpdateGlobalExitRoot,
        bytes calldata permitData
    ) external;
}

IZkEVMBridge constant zkevmBridge = IZkEVMBridge(0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe);

using SafeTransferLib for ERC20;

/// @author 0xdapper
/// @dev This contract is mostly a helper for bridging tokens to Polygon ZkEVM L2
///      in a cowswap post-hook. However, cowswap hooks are not atomic and if for
///      some reason `bridgeToken` fails, the swap will still succeed and end up
///      with tokens in this contract for anyone to bridge it to themselves.
contract ZkEVMBridger {
    /// @dev Helper method that will bridge all available balance of given
    ///      token to the `_receiver` address on Polygon ZkEVM L2.
    function bridgeToken(ERC20 _token, address _receiver) external {
        uint256 balance = _token.balanceOf(address(this));
        _token.safeApprove(address(zkevmBridge), balance);
        zkevmBridge.bridgeAsset(1, _receiver, balance, address(_token), true, hex"");
    }
}
