#!/bin/sh

echo "Configuring postfix"

# save original master.cf
if [ ! -e /etc/postfix/main.cf.orig ]; then
	echo "Backing up original main.cf"
    mv /etc/postfix/main.cf /etc/postfix/main.cf.orig
fi
echo "Update main.cf"
cat /vagrant_provision/main.cf > /etc/postfix/main.cf



if [ ! -e /etc/postfix/master.cf.orig ]; then
	echo "Backup master.cf"
    cp /etc/postfix/master.cf /etc/postfix/master.cf.orig
else
	echo "Update master.cf"
	cat /etc/postfix/master.cf.orig > /etc/postfix/master.cf
fi

# enable smtp
cat >> /etc/postfix/master.cf <<CONF
submission inet n       -       -       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_wrappermode=no
  -o smtpd_tls_security_level=may
  -o smtpd_sasl_auth_enable=no
  -o smtpd_recipient_restrictions=permit_mynetworks,reject
  -o milter_macro_daemon_name=ORIGINATING
  -o smtpd_sasl_type=dovecot
CONF

# enable zeyple
cat >> /etc/postfix/master.cf <<CONF
zeyple    unix  -       n       n       -       -       pipe
  user=zeyple argv=/usr/local/bin/zeyple.py \${recipient}

localhost:10026 inet  n       -       n       -       10      smtpd
  -o content_filter=
  -o receive_override_options=no_unknown_recipient_checks,no_header_body_checks,no_milters
  -o smtpd_helo_restrictions=
  -o smtpd_client_restrictions=
  -o smtpd_sender_restrictions=
  -o smtpd_recipient_restrictions=permit_mynetworks,reject
  -o mynetworks=127.0.0.0/8
  -o smtpd_authorized_xforward_hosts=127.0.0.0/8
CONF

service postfix restart