#!/bin/sh

echo "Configuring dovecot"

if [ ! -e /etc/dovecot/dovecot.conf.orig ]; then
    cp /etc/dovecot/dovecot.conf /etc/dovecot/dovecot.conf.orig
fi


cat /vagrant_provision/dovecot.conf > /etc/dovecot/dovecot.conf



if [ ! -e /etc/dovecot/cert ]; then
    mkdir /etc/dovecot/cert
fi


if [ ! -e /etc/dovecot/cert/private.pem ]; then
    openssl genrsa -out /etc/dovecot/cert/private.pem 1024
fi

if [ ! -e /etc/dovecot/cert/public.pem ]; then
    openssl req \
		-new \
		-x509 \
		-newkey rsa:4096 \
		-days 3650 \
		-key /etc/dovecot/cert/private.pem \
		-out /etc/dovecot/cert/public.pem \
		-subj "/C=/ST=/L=/O=/CN=localhost"
fi


sudo service dovecot restart