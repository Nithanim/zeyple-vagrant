#!/bin/sh

# First check to see if the user already exits
if getent passwd testuser1 > /dev/null; then
    echo 'testuser1 already exists'
else
    echo 'Creating User "testuser1" with password "zeyple"'
    sudo useradd testuser1 -m -s /bin/bash

    # Use chpasswd since we can pipe in a new password
    echo "testuser1:zeyple"|sudo chpasswd
    echo 'User created'
fi

if getent passwd testuser2 > /dev/null; then
    echo 'testuser2 already exists'
else
    echo 'Creating User "testuser2" with password "zeyple"'
    sudo useradd testuser2 -m -s /bin/bash

    echo "testuser2:zeyple"|sudo chpasswd
    echo 'User created'
fi
