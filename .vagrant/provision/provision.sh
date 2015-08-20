#!/bin/sh


/bin/bash /vagrant_provision/users.sh
/bin/bash /vagrant_provision/postfix.sh
/bin/bash /vagrant_provision/dovecot.sh
/bin/bash /vagrant_provision/gui.sh
/bin/bash /vagrant_provision/thunderbird.sh
/bin/bash /vagrant_provision/zeyple.sh