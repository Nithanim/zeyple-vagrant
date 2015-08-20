# zeyple-vagrant
With the help of vagrant this project aims to create a fully working test environment for [Zeyple](https://github.com/infertux/zeyple/) on your desktop with one single command.

## Requirements
* [Vagrant](https://www.vagrantup.com/) 
* a compatible virtualization environment ([VirtualBox](https://www.virtualbox.org/) for example)

## How to use
After you have cloned this repository (e.g. ```git clone https://github.com/Nithanim/zeyple-vagrant.git```) copy config.default.yml to config.yml. The default conf is setup so that it works out of the box if this and the zeyple repository are in the same root folder. If this is not the case on your machine simply change the path in the .yml to the path to the zeyple repository.

Then open a shell in the base directory of this repositoy and type `vagrant up`. This will setup a linux box with everything preconfigured (Thunderbird included) so you can start with sending emails right away after the installation has completed. However, it needs to download a lot of things and the installation takes quite some time too so let it run for a bit.

If everything has finished, the only thing you need to do is edit the zeyple.py on your real system. Every change is  reflected automatically in the guest OS and used by postfix. If you need the output of the zeyple.log you can type `vagrant ssh` in the same shell you used to start the OS and then `tail -f /var/log/zeyple.log` as you would on your real machine.

When you are done with testing you can type `vagrant halt` to shut everything down. If you want to delete the test environment you can use `vagrant destroy` to delete the box.

## Known problems ##
If you get an error that sounds like
```Command died with status 127: "/usr/local/bin/zeyple.py". Command output: /usr/bin/env: python_: No such file or directory```
you need to make sure that the line-endings in the zeyple.py are LF and not CRLF.
