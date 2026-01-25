#!/usr/local/bin/php -q
<?php
/*
 * enable-nat-reflection.php
 *
 * Enables NAT reflection (hairpin NAT) to allow internal clients
 * to access services via the public IP address.
 *
 * Usage: /usr/local/bin/php /root/enable-nat-reflection.php
 */

require_once("/etc/inc/config.inc");
require_once("/etc/inc/functions.inc");
require_once("/etc/inc/filter.inc");
require_once("/etc/inc/shaper.inc");

global $config;

echo "=== pfSense NAT Reflection Configuration ===\n\n";

// Check current NAT reflection setting
$current_setting = isset($config['system']['disablenatreflection']) ? "disabled" : "enabled";
echo "Current NAT reflection status: {$current_setting}\n";

// Enable NAT reflection
if (isset($config['system']['disablenatreflection'])) {
    unset($config['system']['disablenatreflection']);
    echo "[+] Enabled NAT reflection globally\n";

    // Set reflection mode for port forwards to 'purenat' (Pure NAT)
    if (!isset($config['system']['reflectiontimeout'])) {
        $config['system']['reflectiontimeout'] = '';
    }

    // Write configuration
    write_config("Enabled NAT reflection for internal access to public IP services");

    // Reload filter rules
    echo "[*] Reloading firewall rules...\n";
    filter_configure();

    echo "[+] Firewall rules reloaded\n";
    echo "\nNAT reflection is now ENABLED\n";
} else {
    echo "[=] NAT reflection is already enabled\n";
}

echo "\nDone.\n";
?>
