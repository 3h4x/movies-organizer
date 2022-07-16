import os
import re
import subprocess
import click
from imdb import IMDb
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
def main_imdb(str21):
    ia = IMDb()
    s_result = ia.search_movie(str21)
    series = []
    for ss in s_result:
        if ss["kind"] == "tv series":
            str2 = ss["title"]
            series.append(str2)
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


RE_X = r"(\d)+\s+x\s+(\d+)"


def hasX(inputString):
    return bool(re.search(RE_X, inputString, re.IGNORECASE))


RE_SE = r"SE?(\d+)EP?(\d+)"


def hasSE(inputString):
    return bool(re.search(RE_SE, inputString, re.IGNORECASE))


def get_season_episode(file_name: str):
    if hasSE(file_name):
        season, episode = re.search(RE_SE, file_name, re.IGNORECASE).groups()
        return AddZero(season), AddZero(episode)
    elif hasX(file_name):
        season, episode = re.search(RE_X, file_name, re.IGNORECASE).groups()
        return AddZero(season), AddZero(episode)

    return "", ""


def sanitize_name(file_name):
    file_name = re.sub(RE_X, "", file_name)
    file_name = re.sub(RE_SE, "", file_name)
    return file_name.replace("-", " ").replace(".", " ").strip()


def AddZero(inputString):
    if int(inputString) < 10:
        return str("0" + str(int(inputString)))
    return inputString


def rename_series(path):
    print("Reading Files....")

    for (dirpath, _, _) in os.walk(path):
        files = os.listdir(dirpath)
        for file in files:
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
            series = main_imdb(file_name)
            file_name = find_most_apt(file_name, series)
            file_name = removeIllegal(file_name).strip()
            Final = f"SE{season}EP{episode} - {file_name}{extension}"

            path_output = os.path.join(file_name, f"Season {season}")  # type: ignore

            try:
                os.mkdir(file_name)
                os.mkdir(path_output)
            except FileExistsError:
                pass
            try:
                if click.confirm(f'Rename "{file}" to "{Final}"?', default=True):
                    # cross device mv
                    subprocess.check_call(
                        f'mv "{file}" "{os.path.join(path_output, Final)}"',
                        cwd=path,
                        shell=True,
                    )
            except FileExistsError:
                print(f"Error - File Already Exist: {Final}")

        click.echo("All Files Processed...")
