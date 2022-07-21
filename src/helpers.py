
import os
import subprocess

import click


def is_video(extension):
    return extension in [".mp4", ".mkv", ".srt", ".avi", ".wmv"]


def rename_file(path, file, output_path, output_name, force):
    subprocess.check_call(f'mkdir -p "{output_path}"', cwd=path, shell=True)

    try:
        if force or click.confirm(f'Rename "{file}" to "{output_name}"?', default=True):
                # cross device mv
            subprocess.check_call(
                    f'mv "{file}" "{os.path.join(output_path, output_name)}"',
                    cwd=path,
                    shell=True,
                )
    except FileExistsError:
        print(f"Error - File Already Exist: {output_name}")
