title: Migrating Fedora from BIOS to UEFI
tags:
  - linux
new_post_name: fedora-bios-to-uefi
categories:
  - devops
date: 2017-11-13 17:21:13
---

Let me tell you a story.

This is not a sad story, but a geeky one.

A story about a developer that was told it's impossible to migrate his Fedora OS from BIOS to UEFI, and against all odds, succeeded.

![](/images/2017/11/xkcd-obsolete-tech.jpg)

A few months ago I started working at a new place and got a shiny [Dell XPS 9560](http://www.dell.com/en-us/shop/dell-laptops/xps-15/spd/xps-15-9560-laptop).

The spec was amazing: Top of the line CPU, GPU, 4k screen and even 32gb of RAM!

But the issues.. oh... the issues. Thank god most of them are solvable by a simple firmare upgrade. The rest are GPU issues which led me to disable the embedded NVIDIA GPU (which I don't need anyway).

Ok, so how do I upgrade the firmware? `fwupd` comes to the rescue:
> *"**fwupd** is an open source daemon for managing the installation of firmware updates on Linux-based systems, developed by GNOME maintainer Richard Hughes..."* - [Wikipedia](https://en.wikipedia.org/wiki/Fwupd).

I was a few keystrokes away from getting all my issues solved!
Dell [put in a lot of effort](https://blogs.gnome.org/hughsie/2017/02/08/new-fwupd-release-and-why-you-should-buy-a-dell/) to make sure [fwupd](https://github.com/hughsie/fwupd) works great with their products, So I wasn't suprised that my laptop is [supported](https://fwupd.org/lvfs/device/34578c72-11dc-4378-bc7f-b643866f598c).

```bash
$ fwupdmgr refresh
$ fwupdmgr update
No devices can be updated: Nothing to do

$ fwupdate --supported
Firmware updates are not supported on this machine.
```

What?! but why?! `fwupdmgr` recognizes my devices:
```bash
$ fwupdmgr get-devices
Intel AMT (unprovisioned)
...

XPS 15 9560 System Firmware
...

Integrated Webcam HD
...

GP107M [GeForce GTX 1050 Mobile]
...
```

So what's wrong? I'm connected to AC, I'm running as root, I got [UEFI Capsule Updates](http://www.dell.com/support/article/us/en/19/sln171755/updating-the-dell-bios-in-linux-and-ubuntu-environments?lang=en) turned on.

Oh wait. I'm not using [UEFI](https://en.wikipedia.org/wiki/Unified_Extensible_Firmware_Interface). No problem! let's migrate!

![https://docs.fedoraproject.org/f26/install-guide/install/Booting_the_Installation.html](/images/2017/11/fedora_boot.png)

My first thought: *"Oh shit. I'm f\*cked"*. My second thought: *"that doesn't make any sense!*.

## Game Plan

All I need is a simple `grub-mkconfig` while booted in UEFI mode, but how? 
1. Convert my paritition table to [GUID Partition Table](https://en.wikipedia.org/wiki/GUID_Partition_Table)
2. Free up some space for an [EFI Partition](https://en.wikipedia.org/wiki/EFI_system_partition) `/boot/efi` paritition
3. Update GRUB to use UEFI

Before we continue, I want to share we you my own partition table:

```
Disk /dev/sda: 953.9 GiB, 1024209543168 bytes, 2000409264 sectors
Units: sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disklabel type: dos

Device              Start        End    Sectors   Size Type
/dev/sda1       2048    1953791    1951744   953M Linux filesystem
/dev/sda2    1953792   60549119   58595328    28G Linux swap
/dev/sda3   60549120  493574143  433025024 206.5G Linux filesystem
/dev/sda4 493574144 1669111807 1175537664 560.6G Linux filesystem
/dev/sda5 1669111808 2000203775  331091968 157.9G Linux filesystem
```

I have two OS's installed. Arch & Fedora -  
- **Arch**: `/boot` is mounted at `/dev/sda1` and `/` is mounted at `/dev/sda3`.
- **Fedora**: `/` is mounted at `/dev/sda4`.

Both use `/dev/sda2` for swap, and `/dev/sda5` has some other data.  
I don't need Arch anymore, and would like to migrate Fedora to UEFI.

## LiveUSB

I know that most of the changes I had to do couldn't be done on mounted volumes, ,so I had to use a LiveCD. But nobody uses LiveCD's nowadays - LiveUSB is the word on the streets.

I had two options. Either [Download](https://fedoraproject.org/wiki/FedorlaLiveCD) a LiveCD and burn it, or use [Fedora Media Writer](https://fedoraproject.org/wiki/How_to_create_and_use_Live_USB).  


## Booting into UEFI mode

First of all - I changed my BIOS configuration to boot up in UEFI mode.  
Then, because I'm paranoid, I checked that I'm actually booted up in EFI mode:
```bash
$ sudo efibootmgr
EFI variables are not supported on this system.
```

Damn! that meant I wasn't loaded into EFI, but I was ??
```bash
$ sudo modprobe efivarfs
$ sudo efibootmgr
BootCurrent: 0013
Timeout: 0 seconds
BootOrder: 0000
Boot0000  Fedora
```

Bam!

## Convert parition table to GPT

I got the LiveUSB installed on a company thumb drive. Now I need to convert my paritition table from dos to GUID (GPT).

This step is rather simple. I Used [gdisk](https://www.rodsbooks.com/gdisk): 
```bash
# shouldn't require a password
$ su
$ gdisk /dev/your/device
# gdisk will now prompt that it wants to convert the partition table.
# press 'w' to save and you're done.
```

## Free up space

I actually had another OS installed at the beginning of the partition table which I didn't use anymore, so I just deleted it and recreated the EFI parition there.

If you don't have one, install [GParted](https://gparted.org) and use it to free up ~500mb.

A few notes:

- The EFI boot parition can be shared between OS's. if you have one for Windows, no need to create another one.
- The parition location isn't important - it doesn't have to reside in the beginning of the block for instance.
- A parition size of ~500mb should suffice.


## Update GRUB

### Recap

I’ve got a new [GPT partition table](https://en.wikipedia.org/wiki/GUID_Partition_Table) with an [EFI partition](https://en.wikipedia.org/wiki/EFI_system_partition) at the beginning:


```
Disk /dev/sda: 953.9 GiB, 1024209543168 bytes, 2000409264 sectors
Units: sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 512 bytes
I/O size (minimum/optimal): 512 bytes / 512 bytes
Disklabel type: gpt

Device              Start        End    Sectors   Size Type
/dev/sda6       2048    1953791    1951744   953M EFI System
/dev/sda7    1953792   60549119   58595328    28G Linux swap
/dev/sda4   60549120 1669111807 1175537664 413.1G Linux filesystem
/dev/sda5 1669111808 2000203775  331091968 157.9G Linux filesystem
```

### chroot

I need `Fedora` to mount `/boot/efi` on boot, and configured to use UEFI. [chroot](https://en.wikipedia.org/wiki/Chroot) to the rescue!

For those of you that have never heard of **c**hange **root**, [Wikipedia](https://en.wikipedia.org/wiki/Chroot) provides a good explanation:
> **Chroot** is an operation that changes the apparent root directory for the current running process and their children.  
> 
> A program that is run in such a modified environment cannot access files and commands outside that environmental directory tree. This modified environment is called a chroot jail.

So back to where we were... Let's chroot and get this over with. 

```bash
# just login as root
$ sudo su
# mounting  everything
$ mount /dev/sda4 /mnt/fedora
$ mount /dev/sda6 /mnt/fedora/boot/efi
$ mount -t proc proc /mnt/fedora/proc/
$ mount --rbind /sys /mnt/fedora/sys/
$ mount -t efivarfs efivarfs /sys/firmware/efi/efivars
$ mount --rbind /dev /mnt/fedora/dev/
$ mount --rbind /var /mnt/fedora/var/

# copying over the efi mount point
# you might want to comment-out any /boot mounts you might have
# this step is crucial, because we need an fstab entry for the efi partition.
$ grep "/boot/efi" /etc/fstab >> /mnt/fedora/etc/fstab

# chroot into your system
$ chroot /mnt/fedora /bin/bash
```

Awesome. I'm in my `Fedora`. Now I need to follow Fedora's [Updating GRUB 2 configuration on UEFI systems](https://fedoraproject.org/wiki/GRUB_2#Updating_GRUB_2_configuration_on_UEFI_systems).  

TL;DR:

Oh wait! My paranoid self keeps asking to check that I have an fstab entry
for the efi partition. Let's give him some peace:

```bash
$ grep "/boot/efi" /etc/fstab
```

Good catch! I forgot to add it previously. Let's add it:
```bash
$ echo "/dev/sda6 /boot/efi vfat defaults 0 1" >> /etc/fstab
```

TL;DR #2:

```bash
$ sudo dnf reinstall grub2-efi grub2-efi-modules shim
$ sudo grub2-mkconfig -o /boot/efi/EFI/fedora/grub.cfg
```

It worked! `grub2-mkconfig` told me it found `Fedora`!

If it didn't, I could've done this step manually:
```
$ sudo efibootmgr --create --disk /dev/sda --part 6 --loader /EFI/fedora/grubx64.efi --label "Fedora"
```

## Checking that it all works

I know it sounds stupid, because the OS already booted, but why not?

```bash
$ ls /sys/firmware/efi/efivars | wc -l
81

$ efibootmgr
BootCurrent: 0007
Timeout: 0 seconds
BootOrder: 0007
Boot0000* Windows Boot Manager
Boot0006* Linux-Firmware-Updater \fwupx64.efi
Boot0007* Fedora
```

See? that wasn't too hard!

## Upgrading Firmware

After I did all that, I reran `fwupd`:
```bash
$ fwupdate --supported
Firmware updates are supported on this machine.
```

Yay!

```bash
$ fwupdmgr refresh
$ fwupdmgr update
...
$ reboot
```

Done. By the way, *ALL* the issues I previously had were gone after upgrading!
![](/images/2017/11/sorry_potato.jpg)
