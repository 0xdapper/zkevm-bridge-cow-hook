import {Script} from "forge-std/Script.sol";
import {ZkEVMBridger} from "src/ZkEVMBridger.sol";

contract ZkEVMBridgerScript is Script {
    function run() external {
        vm.broadcast();
        new ZkEVMBridger();
    }
}
