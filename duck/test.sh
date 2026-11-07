#!/bin/sh

expected_dae_version=2026.11.07

case "$1" in
	"dae")
		dae --version | grep "$expected_dae_version"
		;;
esac
