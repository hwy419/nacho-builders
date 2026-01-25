#!/usr/local/bin/php -q
<?php
/*
 * add-nat-rules.php
 *
 * Adds NAT port forwarding rules and associated firewall rules for:
 * - HTTP/HTTPS to Nginx Proxy Manager
 * - Cardano relay P2P connections
 *
 * Usage: /usr/local/bin/php /root/add-nat-rules.php
 */

require_once("/etc/inc/config.inc");
require_once("/etc/inc/functions.inc");
require_once("/etc/inc/filter.inc");
require_once("/etc/inc/shaper.inc");

// Initialize globals
global $config;

echo "=== pfSense NAT Rules Configuration ===\n\n";

// Define NAT port forward rules
$nat_rules = array(
    array(
        "descr" => "HTTP to Nginx Proxy Manager",
        "interface" => "wan",
        "protocol" => "tcp",
        "source" => array("any" => ""),
        "destination" => array("network" => "wanip", "port" => "80"),
        "target" => "192.168.150.224",
        "local-port" => "80",
        "natreflection" => "enable",
        "associated-rule-id" => "pass"
    ),
    array(
        "descr" => "HTTPS to Nginx Proxy Manager",
        "interface" => "wan",
        "protocol" => "tcp",
        "source" => array("any" => ""),
        "destination" => array("network" => "wanip", "port" => "443"),
        "target" => "192.168.150.224",
        "local-port" => "443",
        "natreflection" => "enable",
        "associated-rule-id" => "pass"
    ),
    array(
        "descr" => "Cardano Relay 1 P2P (Mainnet)",
        "interface" => "wan",
        "protocol" => "tcp",
        "source" => array("any" => ""),
        "destination" => array("network" => "wanip", "port" => "6001"),
        "target" => "192.168.160.11",
        "local-port" => "6000",
        "associated-rule-id" => "pass"
    ),
    array(
        "descr" => "Cardano Relay 2 P2P (Mainnet)",
        "interface" => "wan",
        "protocol" => "tcp",
        "source" => array("any" => ""),
        "destination" => array("network" => "wanip", "port" => "6002"),
        "target" => "192.168.160.12",
        "local-port" => "6000",
        "associated-rule-id" => "pass"
    ),
    array(
        "descr" => "Cardano Preprod Relay P2P",
        "interface" => "wan",
        "protocol" => "tcp",
        "source" => array("any" => ""),
        "destination" => array("network" => "wanip", "port" => "6003"),
        "target" => "192.168.161.11",
        "local-port" => "6000",
        "associated-rule-id" => "pass"
    )
);

// Initialize NAT rules array if not exists
if (!isset($config["nat"]["rule"]) || !is_array($config["nat"]["rule"])) {
    $config["nat"]["rule"] = array();
}

// Get existing NAT rule descriptions
$existing_nat_descriptions = array();
foreach ($config["nat"]["rule"] as $rule) {
    if (isset($rule["descr"])) {
        $existing_nat_descriptions[] = $rule["descr"];
    }
}

// Add NAT rules that don't already exist
$added_count = 0;
foreach ($nat_rules as $rule) {
    if (!in_array($rule["descr"], $existing_nat_descriptions)) {
        $config["nat"]["rule"][] = $rule;
        echo "[+] Added NAT rule: {$rule["descr"]}\n";
        echo "    External port {$rule["destination"]["port"]} -> {$rule["target"]}:{$rule["local-port"]}\n";
        $added_count++;
    } else {
        echo "[=] NAT rule already exists: {$rule["descr"]}\n";
    }
}

if ($added_count > 0) {
    echo "\n=== Saving Configuration ===\n";

    // Write configuration
    write_config("Added {$added_count} NAT port forward rules for web services and Cardano relays via Ansible");

    echo "[+] Configuration saved\n";

    // Reload filter rules
    echo "[*] Reloading firewall rules...\n";
    filter_configure();

    echo "[+] Firewall rules reloaded\n";
    echo "\n=== Summary ===\n";
    echo "Added {$added_count} new NAT port forward rules\n";
    echo "Associated firewall rules were auto-created (associated-rule-id=pass)\n";
} else {
    echo "\n=== No Changes Needed ===\n";
    echo "All NAT rules already exist in configuration\n";
}

// Display current NAT rules
echo "\n=== Current NAT Port Forward Rules ===\n";
if (isset($config["nat"]["rule"]) && is_array($config["nat"]["rule"])) {
    foreach ($config["nat"]["rule"] as $idx => $rule) {
        $descr = isset($rule["descr"]) ? $rule["descr"] : "No description";
        $ext_port = isset($rule["destination"]["port"]) ? $rule["destination"]["port"] : "?";
        $target = isset($rule["target"]) ? $rule["target"] : "?";
        $local_port = isset($rule["local-port"]) ? $rule["local-port"] : "?";
        echo "{$idx}. {$descr}\n";
        echo "   WAN:{$ext_port} -> {$target}:{$local_port}\n";
    }
} else {
    echo "No NAT rules configured\n";
}

echo "\nDone.\n";
?>
