#!/bin/sh

echo "Setting up thunderbird"

apt-get -qqy install thunderbird

if [ ! -e /root/.thunderbird/ ]; then
	cp -r /vagrant_provision/.thunderbird/ /root/
fi

if [ ! -e /root/.gnupg ]; then
	cp -r /vagrant_provision/.gnupg/ /root/
fi
