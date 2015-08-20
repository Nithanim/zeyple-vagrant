#!/bin/sh

apt-get install gnupg python-gpgme sudo


echo "Configuring zeyple"
if getent passwd zeyple > /dev/null; then
	echo 'User "zeyple" already exists'
else
	echo 'Creating User "zeyple"'
	adduser --system --no-create-home --disabled-login zeyple
	echo 'User created'
fi

if [ ! -e /usr/local/bin/zeyple.py ]; then
    ln -s /vagrant_data/zeyple.py /usr/local/bin/zeyple.py 
fi

if [ ! -e /etc/zeyple.conf ]; then
    ln -s /vagrant_data/zeyple.conf.example /etc/zeyple.conf
fi


mkdir -p /var/lib/zeyple/keys && chmod 700 /var/lib/zeyple/keys && chown zeyple /var/lib/zeyple/keys

sudo -u zeyple gpg --homedir /var/lib/zeyple/keys --import /vagrant_provision/testuser2_pub.asc

chmod 744 /usr/local/bin/zeyple.py && chown zeyple /usr/local/bin/zeyple.py
touch /var/log/zeyple.log && chown zeyple /var/log/zeyple.log