#!/usr/bin/env python3
import sys
import click

from imdb import IMDb

from rename_movies import rename_movies
from rename_series import rename_series


@click.group(help="Rename Media Files")
@click.pass_context
def main(ctx):
    ctx.ensure_object(dict)
    ctx.obj["imdb_client"] = IMDb()


@main.command(help="Rename Movies")
@click.pass_context
@click.option("--path", "-p", help="Path", default=".")
@click.option(
    "--default", help="Should default answer for renaming be True", default=True
)
def movies(ctx, path, default):
    rename_movies(ctx, path, default)


@main.command(help="Rename TV Series")
@click.pass_context
@click.option("--path", "-p", help="Path", default=".")
@click.option("--force", "-f", help="Automatically rename", is_flag=True, default=False)
def series(ctx, path, force):
    rename_series(ctx, path, force)


if __name__ == "__main__":
    # Clear screen before running anything
    # click.clear()
    try:
        main()
    except Exception as ex:
        click.secho("Failed execution", fg="red")
        click.echo(ex)
        sys.exit(1)