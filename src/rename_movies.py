import os
import click
import ipdb
import re
from imdb import IMDb
from similarity.damerau import Damerau

damerau = Damerau()

# Returns most closest Movie name
def find_most_apt(name, movies):
    deg = []
    for movie in movies:
        if name.upper() == movie.upper():
            return movie
        else:
            deg.append(damerau.distance(name.upper(), movie.upper()))
    indd = int(deg.index(min(deg)))
    mostapt = movies[indd]
    if mostapt == "":
        mostapt = name
    return mostapt


# find_url_in_string
def find_url_in_string(file_name: str) -> str:
    url = re.findall(
        "www.(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\(\)]|(?:%[0-9a-fA-F][0-9a-fA-F]))+",
        file_name,
    )
    return url[0]


# Returns a List Movie name and release year using imDB from Old_FileName
def main_imdb(str21):
    ia = IMDb()
    s_result = ia.search_movie(str21)
    movies = []
    for movie in s_result:
        if movie["kind"] == "movie":
            str2 = movie["title"]
            try:
                year_str = movie["year"]
            except:
                year_str = "----"
            movies.append(str2 + " (" + str(year_str) + ")")
    return movies


# Remove Illegal Name characters
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
    return str


# Primitive FileName Formatting
def FormatStr(file_new_name):
    rest = file_new_name
    if ".1080p" in file_new_name:
        sep = ".1080p"
    elif ".720p" in file_new_name:
        sep = ".720p"
    elif "[" in file_new_name:
        sep = "["
    elif "1080p" in file_new_name:
        sep = "1080p"
    elif "720p" in file_new_name:
        sep = "720p"
    if "TamilRockers" in file_new_name:
        file_new_name = file_new_name.split(" - ", 1)[1]
    try:
        rest = file_new_name.split(sep, 1)[0]
    except:
        pass
    rest = rest.replace(".", " ")
    rest = rest.replace("-", " ")
    rest = rest.replace("(", "")
    rest = rest.replace(")", "")
    return rest.strip()


def rename_movies(path, default):
    files = os.listdir(path)
    for file in files:
        file_new_name = file
        extn = file[(len(file) - 4) : len(file)]
        if file.endswith(".mp4") or file.endswith(".mkv") or file.endswith(".srt"):
            try:
                url = find_url_in_string(file_new_name)
                file_new_name = file_new_name.replace(url, "")
            except:
                pass
            file_new_name = FormatStr(file_new_name.strip())
            year_str = (
                "(" + file_new_name[len(file_new_name) - 4 : len(file_new_name)] + ")"
            )
            file_new_name = file_new_name[0 : len(file_new_name) - 4]
            Final = file_new_name + year_str
            movies = main_imdb(file_new_name + year_str)
            if not movies:
                click.secho(f'No Match Found for "{file_new_name}"', bg="yellow")
                click.echo()
                continue
            file_new_name = find_most_apt(Final, movies)  # Sometimes causes error
            file_new_name = removeIllegal(Final)
            Final = file_new_name + extn

            path_new = os.path.join("Output", "Movies", file_new_name)
            try:
                os.mkdir("Output")
                os.mkdir(os.path.join("Output", "Movies"))
                os.mkdir(path_new)
            except FileExistsError:
                pass
            try:
                if click.confirm(f'Rename "{file}" to "{Final}"?', default=default):
                    os.rename(os.path.join(path, file), os.path.join(path_new, Final))
            except:
                click.secho("Error - File Already Exist: " + file_new_name, bg="red")

        click.echo()

    click.echo("All Files Processed...")
