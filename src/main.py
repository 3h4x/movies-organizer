#!/usr/bin/env python3
import os
import sys
import click

from rename_movies import rename_movies
from rename_series import rename_series


@click.group(help="Rename Media Files")
@click.pass_context
def main(ctx):
    ctx.ensure_object(dict)


@main.command(help="Rename Movies")
def movies():
    rename_movies()


@main.command(help="Rename TV Series")
def series():
    click.echo("Hello there")


if __name__ == "__main__":
    # Clear screen before running anything
    # click.clear()
    try:
        main()
    except Exception as ex:
        click.secho("Failed execution", fg="red")
        click.echo(ex)
        sys.exit(1)
