#!/bin/sh

expected_dae_version=2.1.1

case "$1" in
	"dae")
		dae --version | grep "$expected_dae_version"
		;;
esac
