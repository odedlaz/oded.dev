title: sick of sudoers NOPASSWD?
tags:
  - linux
  - project
  - c++
new_post_name: runas-tool
categories:
  - programming
date: 2017-08-30 09:24:00
---

TL;DR: I wrote a tool that allows to run a binary as a different owner/group.  

You can download it from [odedlaz/runas](https://github.com/odedlaz/runas).  

Feel free to request features, [send pull requests](https://github.com/odedlaz/runas/pulls) & [open issues](https://github.com/odedlaz/runas/issues)!

# Motivation

You must be thinking that I'm re-inventing the wheel. Well, I'm not. Let look at the following scenario:  
- There's a binary that you want to run in a non-interactive session.
- You want the binary to run with different permissions then the current user.
- You don't want the user to be able to run *any binary* with *any permissions*,  
  only the one you want, with the requested user / group.
- You don't want a child process to get created, because you want to run the binary  
  as part of a filter without any other processes getting in the way.

A good example would be to debug an elevated app, while running your editor regularly. for example -> running [gdb](https://www.gnu.org/software/gdb/) and debugging a binary as root.

You probably don't want to turn on [**S**et owner **U**ser **ID**](https://www.linux.com/blog/what-suid-and-how-set-suid-linuxunix) because that's a major security hole.  
You also can't use `su` / `sudo` as part of your editor / IDE because they execute the target process as child, which causes many issues.

`sudo` is also somewhat complex to configure, and honestly, I prefer to avoid using it alltogether.

# Solution

A tool that is easy to configure & runs the target binary with requested owner:group.  
[runas](https://github.com/odedlaz/runas) is that tool. It does one thing, and (hopefully) does it well.  

`runas` doesn't have any complicated flags or knobs.
```console
$ runas
Usage: bin/runas user-spec command [args]

version: 0.1.2, license: MIT
```

It just lets you run binaries:  

```console
$ runas root:root bash -c 'whoami && id'
You can't execute '/bin/bash -c whoami && id' as 'root:root': Operation not permitted
```

But you need need the proper permissions to do so.  
```console
$ echo "odedlaz -> root :: /usr/bin/bash -c 'whoami && id'" | sudo tee --append /etc/runas.conf
[sudo] password for odedlaz:
odedlaz -> root :: /usr/bin/bash
```

Notice I added `/usr/bin/bash` which is linked to `/bin/bash`.  
`runas` follows links to their source, to make sure the right binary is called.  
It also mimics the way shells parse commands so the configuration and command should be identical.

For instance, `'whoami && id'` is concatenated by the shell into one argument.  
[runas](https://github.com/odedlaz/runas) makes sure you don't have to think about the way things get parsed.

Anyway, now the command works:
```console
$ runas root:root bash -c 'whoami && id'
root
uid=0(root) gid=0(root) groups=0(root)
```

## "Advanced" Examples

What if you want to allow the user to use *any* argument for a given binary?  
The previous configuration only allows us to run `bash -c 'whoami && id`.
```console
$ runas root:root bash -c id
You can't execute '/bin/bash -c id' as 'root:root': Operation not permitted
```

You don't need to think to much. The configuration is really easy:  
```console
$ echo "odedlaz -> root :: /usr/bin/bash" | sudo tee --append /etc/runas.conf
[sudo] password for odedlaz:
odedlaz -> root :: /usr/bin/bash
```

And now any argument passed to bash will work, including the previous one:
```
$ runas root:root bash -c id
uid=0(root) gid=0(root) groups=0(root)
```

You can also lock the user to run `bash -c` commands exclusively.:  
```console
$ echo 'odedlaz -> root :: /usr/bin/bash -c .*' | sudo tee --append /etc/runas.conf
[sudo] password for odedlaz:
odedlaz -> root :: /usr/bin/bash -c .*
```

And now the user can run any argument that begins with `-c`.  
If we'd remove the previous command, we won't be able to run bash without `-c`:
```console
$ runas root:root bash -c id
uid=0(root) gid=0(root) groups=0(root)

$ runas root:root bash
You can't execute '/bin/bash' as 'root:root': Operation not permitted
```

`runas` is greedy. It'll try to find a configuration that allows to run the given command, and will stop once it finds one.

### Group permissions

What if you want to allow specific group members to run a command? Again, you don't need to think to much:  
```console
$ echo "%docker -> root :: /bin/systemctl restart docker" | sudo tee --append /etc/runas.conf
[sudo] password for odedlaz:
%docker -> root :: /bin/systemctl restart docker
```

And now any member of the `docker` group can restart the docker daemon!

### Fine-grained permissions

[runas](https://github.com/odedlaz/runas) uses c++ 14, which comes with a built-in [ECMAScript](https://en.wikipedia.org/wiki/ECMAScript) flavored [regex](/2017/03/07/master-regular-expressions/) library.  
Using regular expressions can be really helpful when you want to have a lot of control over given permissions, which is still easy to understand..  

A good example would be to allow the user to run only "readonly" operations on systemd units:  
```console
$ echo "odedlaz -> root :: /bin/systemctl (start|stop|restart|cat) .*" | sudo tee --append /etc/runas.conf
[sudo] password for odedlaz:
odedlaz -> root :: /bin/systemctl (start|stop|restart|cat) .*
```

Now the user doesn't need root permissions to perform `start`, `stop`, `restat` and `cat` operations:  
```console
$ runas root systemctl cat docker
[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target docker.socket firewalld.service
Wants=network-online.target
Requires=docker.socket
...
```

# Why reinvent gosu?

[gosu](https://github.com/tianon/gosu) is a tool that was invented to solve TTY & signaling issues, mainly for containers.  
As I said before, `sudo` and `su` run the target process as a child, which means all signals are passed to them, and sometimes aren't forwarded propely.   
`gosu` solves that issue, but doesn't provide a permissions mechanism which makes it practically impossible to use on regular systems that need an extra layer security.

`gosu` is also written in Go, which is notoriously known for creating *really* big binaries:  
- 1.23MB for the amd64 release
- 1.1MB for the i386 release


[runas](https://github.com/odedlaz/runas)'s binary takes only 200KB unpacked, and ~60KB when packed with [UPX](https://upx.github.io).
