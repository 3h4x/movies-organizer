import os
import re
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


# has Condition #1
def hasX(inputString):
    return bool(re.search(r"\dx\d", inputString) or re.search(r"\d x \d", inputString))


# has Condition #2
def hasSE(inputString):
    return bool(
        re.search(r"S\d\dE\d\d", inputString)
        or re.search(r"S\dE\d\d", inputString)
        or re.search(r"s\d\de\d\d", inputString)
        or re.search(r"s\de\d\d", inputString)
    )


# has Condition #3
def hasSEP(inputString):
    return bool(
        re.search(r"S\d\dEP\d\d", inputString)
        or re.search(r"S\dEP\d\d", inputString)
        or re.search(r"s\d\dep\d\d", inputString)
        or re.search(r"s\dep\d\d", inputString)
    )


def FindName(inputString):
    inputString = inputString.replace(" x ", "x", 1)
    filteredList = filter(None, re.split(r"(\dx\d)", inputString))
    for element in filteredList:
        Name = element
        Name = Name.replace("-", " ")
        Name = Name.replace(".", " ")
        Name = Name.strip()
        return str(Name)


def FindDet(inputString):
    inputString = inputString.replace(" x ", "x", 1)
    filteredList = filter(None, re.split(r"(\dx\d\d)", inputString))
    i = 0
    for element in filteredList:
        Det = element
        Det = Det.replace(".", " ")
        Det = Det.replace("-", " ")
        Det = Det.strip()
        if i == 1:
            return str(Det)
        i = i + 1


def FindSeason(inputString):
    Det = FindDet(inputString)
    Season = Det.split("x")[0]
    return str(Season)


def FindEpisode(inputString):
    Det = FindDet(inputString)
    Episode = Det.split("x")[1]
    return str(Episode)


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

            # All possible media extensions go here
            media_extensions = [".mp4", ".mkv", ".srt", ".avi", ".wmv"]

            if (file.endswith(ex1) for ex1 in media_extensions):
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
                ]
                for stuff in unwanted_stuff:
                    file_name = file_name.replace(stuff, "")
                file_name = file_name.replace(".", " ")

                # Specifically written for'x' type Files
                if hasX(file):
                    NAME = FindName(file_name)
                    SEASON = FindSeason(file_name)
                    EPISODE = AddZero(FindEpisode(file_name))
                    Final = (
                        "S" + AddZero(FindSeason(file_name)) + "E" + EPISODE + extension
                    )

                # Specifically written for 'S__E__' type Files
                elif hasSE(file):
                    NAME = ""
                    Final = ""
                    for word in file_name.split(" "):
                        if hasSE(word):
                            Final = word
                            break
                        if hasSEP(word):
                            Final = word
                            break
                        else:
                            NAME = NAME + word + " "
                    if not Final:
                        click.secho(
                            "Didnt find any Season or Episode in file name", fg="red"
                        )
                        continue

                    series = main_imdb(NAME)
                    NAME = find_most_apt(NAME, series)
                    NAME = removeIllegal(NAME).strip()
                    Final = Final.strip()
                    SEASON = Final.split("E", 1)[0]
                    EPISODE = Final.split("E", 1)[1]
                    Final = Final + extension

                else:
                    click.secho(
                        "Didnt find any Season or Episode in file name", fg="red"
                    )
                    continue

                path_new_1 = os.path.join(NAME, f"Season {SEASON}")  # type: ignore

                try:
                    os.mkdir(path_new_1)
                except FileExistsError:
                    pass
                try:
                    os.rename(
                        os.path.join(dirpath, file), os.path.join(path_new_1, Final)
                    )
                except FileExistsError:
                    print(f"Error - File Already Exist: {Final}")

        click.echo("All Files Processed...")
