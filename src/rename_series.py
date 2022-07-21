import os
import re
import subprocess
import click
from similarity.damerau import Damerau


# Find most apt name in Series List
def find_most_apt(name, series):
    damerau = Damerau()
    deg = []
    for ss in series:
        if name.upper() == ss.upper():
            return ss
        else:
            deg.append(damerau.distance(name.upper(), ss.upper()))
    indd = int(deg.index(min(deg)))
    mostapt = series[indd]
    return mostapt


# Retrieves name from imDB
def get_imdb_title(imdb_client, name, season, episode):
    results = imdb_client.search_movie(name)
    series = []
    for result in results:
        if result["kind"] == "tv series":
            series.append(result["title"])
    return series


# Remove illegal characters from file name
def removeIllegal(str):
    str = str.replace("<", "")
    str = str.replace(">", "")
    str = str.replace(":", "")
    str = str.replace('"', "")
    str = str.replace("/", "")
    str = str.replace("\\", "")
    str = str.replace("|", "")
    str = str.replace("?", "")
    str = str.replace("*", "")
    str = str.strip()
    return str


RE_X = re.compile("(\d)+\s+x\s+(\d+)", re.IGNORECASE)
RE_SE = re.compile("SE?(\d+)EP?(\d+)", re.IGNORECASE)
RE_E = re.compile("EP?(\d+)", re.IGNORECASE)

RE_XA = re.compile("(\d)+\s+x\s+(\d+).*", re.IGNORECASE)
RE_SEA = re.compile("SE?(\d+)EP?(\d+).*", re.IGNORECASE)
RE_EA = re.compile("EP?(\d+).*", re.IGNORECASE)


def get_season_episode(file_name: str):
    if re.search(RE_SE, file_name):
        season, episode = re.search(RE_SE, file_name).groups()
        return AddZero(season), AddZero(episode)
    elif re.search(RE_X, file_name):
        season, episode = re.search(RE_X, file_name).groups()
        return AddZero(season), AddZero(episode)
    elif re.search(RE_E, file_name):
        episode = re.search(RE_E, file_name).groups()[0]
        return AddZero(1), AddZero(episode)

    return "", ""


def sanitize_name(file_name):
    file_name = re.sub(RE_XA, "", file_name)
    file_name = re.sub(RE_SEA, "", file_name)
    file_name = re.sub(RE_EA, "", file_name)
    return file_name.replace("-", " ").replace(".", " ").strip()


def AddZero(input):
    if int(input) < 10:
        return str("0" + str(int(input)))
    return input


def rename_series(ctx, path, force):
    click.echo("Reading Files....")

    for file in sorted(os.listdir(path)):
        _, file = os.path.split(file)
        file_name, extension = os.path.splitext(file)

        if extension not in [".mp4", ".mkv", ".srt", ".avi", ".wmv"]:
            continue

        unwanted_stuff = [
            ".1080p",
            ".720p",
            "HDTV",
            "x264",
            "AAC",
            "E-Subs",
            "ESubs",
            "WEBRip",
            "WEB",
            "BluRay",
            "Bluray",
        ]
        for stuff in unwanted_stuff:
            file_name = file_name.replace(stuff, "")
        file_name = file_name.replace(".", " ")

        season, episode = get_season_episode(file_name)
        if not (season and episode):
            click.secho(f'No Season/Episode found in "{file_name}"', fg="red")
            continue

        file_name = sanitize_name(file_name)
        series = get_imdb_title(ctx.obj["imdb_client"], file_name, season, episode)
        if not series:
            click.secho(f'Couldnt find imdb series for "{file_name}"', fg="yellow")
            continue

        file_name = find_most_apt(file_name, series)
        file_name = removeIllegal(file_name).strip()
        output_name = f"{file_name} S{season}E{episode}{extension}"

        path_output = os.path.join(file_name, f"Season {int(season)}")  # type: ignore

        subprocess.check_call(f'mkdir -p "{path_output}"', cwd=path, shell=True)

        try:
            if force or click.confirm(f'Rename "{file}" to "{output_name}"?', default=True):
                # cross device mv
                subprocess.check_call(
                    f'mv "{file}" "{os.path.join(path_output, output_name)}"',
                    cwd=path,
                    shell=True,
                )
        except FileExistsError:
            print(f"Error - File Already Exist: {output_name}")

    click.echo("All Files Processed...")
