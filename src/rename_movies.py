import os
import click
import ipdb
import re
from helpers import is_video, rename_file
from similarity.damerau import Damerau

damerau = Damerau()

# Returns most closest Movie name
def get_movie_name(name, movies):
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
def get_imdb_title(imdb_client, name):
    s_result = imdb_client.search_movie(name)
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


def rename_movies(ctx, path, force):
    files = os.listdir(path)
    for file in files:
        file_name, extension = os.path.splitext(file)
        if not is_video(extension):
            continue

        try:
            url = find_url_in_string(file_name)
            file_name = file_name.replace(url, "")
        except:
            pass

        file_name = FormatStr(file_name.strip())

        # See if you can find a year substring
        if re.search("(.*)((19|20)\d{2})(.*)", file_name):
            yearNumber = re.search(
                "(.*)((19|20)\d{2})(.*)", file_name
            )  # name the year substring as "yearnumber"
            movieTitle = yearNumber.group(1)
            movieTitle = movieTitle.strip()
            movieYear = yearNumber.group(2)
            movieYear = "(" + movieYear + ")"
            file_name = movieTitle + " " + movieYear  # count 1 more movie with year

        movies = get_imdb_title(ctx.obj["imdb_client"], file_name)
        if not movies:
            click.secho(f'No Match Found for "{file_name}"', bg="yellow")
            click.echo()
            continue
        file_name = get_movie_name(file_name, movies)  # Sometimes causes error
        file_name = removeIllegal(file_name)
        output_file = file_name + extension
        output_path = os.path.join(file_name)

        rename_file(path, file, output_path, output_file, force=False)

        click.echo()

    click.echo("All Files Processed...")
