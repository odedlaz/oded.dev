title: Working from Home + Corporate VPN
author: Oded Lazar
date: 2021-02-22 19:30:03
tags:
 - devops
 - linux
---
Hey everyone! today I'd like to tell you a small story about a guy that's been stuck working from home for more than a year and is suffering from constant VPN issues. This guy is me!

TLDR: can't access corporate resources? use static routing to redirect connections through the corporate VPN.

Ok, so the story goes like this: I work at a Big-Corp & my team has a couple of VMs deployed on Azure which are governed by an internal service that makes sure that nobody can access them outside the corporate VPN. The service thus a bunch more things, but the gist is that one can't alter the network security group ("firewall" rules) such that outsiders can access the machine.

That's pretty neat, but problematic when you work from home. Why? not all network originating from our machine goes through the corporate network. In other words, when I try to access any resource that belongs to my team, the IP that's being used is the one that belongs to my ISP --> forbidden.

How do I know that? my laptop's [routing table](https://en.wikipedia.org/wiki/Routing_table). The routing table is in charge of mapping the network routes for a given destination IP. On my macOS machine the routing table looks something like this:

```bash
$ netstat -rn
Routing tables

Internet:
Destination        Gateway            Flags        Netif Expire
default            10.0.0.1           UGSc         en0
127                127.0.0.1          UCS          lo0       
127.0.0.1          127.0.0.1          UH           lo0       
```

I truncated some values, but the gist is: any traffic going to 127.0.0.0/8 (255.0.0.0) -> use the `lo0` interface, and everything else go to the default, which is `en0` or `10.0.0.1`. If I turn on the VPN, a new virtual network device appears (a.k.a: [tun device](https://en.wikipedia.org/wiki/TUN/TAP)) and many (many!) more routes show up:

```bash
$ netstat -rn
Routing tables

Internet:
Destination        Gateway            Flags        Netif Expire
default            10.0.0.1           UGSc         en0
127                127.0.0.1          UCS          lo0       
127.0.0.1          127.0.0.1          UH           lo0       
<corporate-ip-1>   10.10.5.125        UGHS         utun2       
<corporate-ip-2>   10.10.5.125        UGHS         utun2       
...
<corporate-ip-500> 10.10.5.125        UGHS         utun2       
```

What basically happens is that the VPN client connects to the vpn server, creates a secure tunnel between my computer and the VPN server, fetches a policy that dictates which IPs and subnets should go through the corporate network and configures my machine to send such traffic through the virtual interface.

When a packet hits the virtual interface, it gets encrypted and sent over the public internet to the VPN server. The VPN server has two "legs": one in the corporate network and one in the public network. Once a client connects, every (verified) packet that arrives to the VPN server on the public internet gets sent to the corporate network.

In our case, we have an azure resource that can only be accessed through the corporate network.
we want to access a specific azure resource that is not configured in the VPN policy. There are two solutions: either fix it locally or use a [jumpbox](https://en.wikipedia.org/wiki/Jump_server).

A jumpbox is a machine that has access to both networks: the public one and the corporate one. I can connect to it (using ssh, rdp, whatever) and than connect to the remote resource. SSH even has a flag for that (`-J` or `ProxyJump`):
```bash
# We connect to the jumpbox than the jumpbox connects to the remote-pc,
# and proxying the traffic between our machine and the remote.
$ ssh -J otheruser@jumpbox user@remote-pc
```

Hack, why should we need another PC? why not just route traffic to the VPN? should be easy. well, it is, all we need to do is a simple static route:
```
$  sudo route -n add -net <remote-pc> <vpn-gateway-ip>
```

That's easy enough, but I honestly don't want to add a static route everytime I want to connect to a remote resource. ITS A PAIN IN THE ASS! Why not write script to do that for me?

Well, I need a few things:

First, I need a way to extract the gateway IP address. the problem? GlobalConnect uses a different IP and with a different interface name everytime it connects!

Second, I want a robust script that has the same completion as ssh does.

Let's tackle the first issue: I guess that GlobalConnect has logs somewhere or a configuration that specifies the interface and ip address it used to create the tun device. in macOS this stuff should sit at `/Library`. I grepped for the VPN server address and viola!

`/Library/Preferences/com.paloaltonetworks.GlobalProtect.settings.plist` contains the VPN configuration:

```
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Palo Alto Networks</key>
	<dict>
		<key>GlobalProtect</key>
		<dict>
			<key>PanGPS</key>
			<dict>
                ... many keys ...
				<key>PreferredIPV6_11de985a54adccec223de2b24075693f</key>
				<string>3b23:110:8:6:6000::5</string>
				<key>PreferredIPV6_234d2be7acce021cd9e49f5c5a7bc41</key>
				<string>3b23:110:68:41:6000::9</string>
				<key>PreferredIPV6_93bb97413136ce437a86418851ac5e99</key>
				<string>2404:f801:50:a:6000::84</string>
				<key>PreferredIPV6_d1ded811e3311a45e766352fca97c7cb</key>
				<string>3b23:110:20:10:6000::147</string>
				<key>PreferredIP_11de985a54adccec223de2b24075693f</key>
				<string>10.10.1.35</string>
				<key>PreferredIP_234d2be7acce021cd9e49f5c5a7bc41</key>
				<string>10.10.5.125</string>
				<key>PreferredIP_93bb97413136ce437a86418851ac5e99</key>
				<string>10.10.1.38</string>
				<key>PreferredIP_d1ded811e3311a45e766352fca97c7cb</key>
				<string>10.10.1.120</string>
			</dict>
            ... many keys ...
</plist>
```

God! this is a piece of shit. I hate parsing xml... maybe there's something that can parse plist files? YESSSS!!! `/usr/libexec/PlistBuddy` does just that! it's like [jq](https://stedolan.github.io/jq/) but for [plist](https://en.wikipedia.org/wiki/Property_list)!

```
$ GP_CONFIG=/Library/Preferences/com.paloaltonetworks.GlobalProtect.settings.plist
$ /usr/libexec/PlistBuddy -c "print 'Palo Alto Networks':GlobalProtect:PanGPS" "$GP_CONFIG" | \
  awk -F'=' '/PreferredIP_/ { print $2 }' | \
  tr -d '[:blank:]' | \
  xargs -I {} fish -c "ifconfig -a | awk '/inet {}/ { print \$2 }'"
```

Turns out there's another way. I also grepped the vpn gateway IP and found it at `/Library/Logs/PaloAltoNetworks/GlobalProtect/network/config/itf-install.sh`.

GlobalConnect writes down all the configuration to the logs directory, including the scripts it uses to configure the routes. the `itf-install.sh` contains this:
```bash
/sbin/ifconfig utun2 10.10.5.125 10.10.5.125 netmask 255.255.255.255 up
/sbin/ifconfig utun2 inet6 2a01:110:68:41:8000::9/128 up
```

Awesome! I can just awk it, but I do need root permissions :(
```
$ ITF_INSTALL=/Library/Logs/PaloAltoNetworks/GlobalProtect/network/config/itf-install.sh
$ sudo awk '/\/sbin\/ifconfig [^ ]+ [0-9]/ { print $3 }' "$ITF_INSTALL"
```

Anyway, once that's working, what about completion? well, in [fish shell](https://fishshell.com/) this is pretty straight forward. All I had to do is find the completion file for `ssh` and just copy it for my script. I called my script `vssh` and the `ssh` completion file sat here: `/opt/local/share/fish/completions/ssh.fish`. I copied it to `~/.config/fish/completions`, replaced `ssh` with `vssh` and viola! I had tab completions :)

Let's start writing down our script... the skeleton should look like this:
```
#!/usr/bin/env fish

set remote <remote-pc>

# get the ip address of the vpn device, using the first method
set gateway (get_global_protect_interface_ipaddr_from_config)

# if first method failed, try the second method
if test -z "$gateway"
   echo "need root privileges in order to find the vpn gateway"
   set gateway (get_global_protect_interface_ipaddr_from_install_script)
end

# test that we have a gateway
if ! ifconfig -a | grep "$gateway" &>/dev/null
    echo "couldn't find any interface bound to $gateway"
    echo "maybe the vpn client is not connected?"
    exit 1
end

if <remote-pc-default-gateway> != <vpn-gateway>
   add_static_route <remote-pc> <vpn-gateway> || exit 1
end

ssh $argv
```

this is pretty straight forward, but two things are missing: how do I find out the hostname if I'm passing arbitrary ssh args? and second, how will this work with ssh-config?

`ssh -G` to the rescue! the `-G` flag causes ssh to print its configuration after evaluating Host and Match blocks. I can use it to find out the actual hostname that `ssh` is going to use in order to connect to the remote host!

```
set remote (ssh -G $argv 2>/dev/null | awk '/^hostname/ { print $2 }')
```

cool, right?! That's all folks! I've uploaded the whole script [to my GitHub](https://gist.github.com/odedlaz/d7ab932bb6c26912bfa64de32d0cfb53). as always, feel free to comment :)
