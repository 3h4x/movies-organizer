import os
import re
from imdb import IMDb
from similarity.damerau import Damerau

# Returns most closest Movie name
def find_most_apt(name, movies):
    damerau = Damerau()
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


# Find any URLs present in FileName
def Find(string):
    url = re.findall(
        "www.(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\(\)]|(?:%[0-9a-fA-F][0-9a-fA-F]))+", string
    )
    return url[0]


def lastIndexOf(str1, toFind):
    index = len(str1) - 1
    i = 0
    for ch in str1:
        if ch == toFind:
            index = i
        i += 1
    return index


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


def rename_movies():
    try:
        os.mkdir("Input")
        os.mkdir(os.path.join("Input", "Movies"))
        os.mkdir("Output")
    except FileExistsError:
        pass

    path = os.path.join("Input", "Movies")
    ErrorFlag = 0
    FileFlag = 0
    import ipdb

    files = os.listdir(path)
    for file in files:
        file_new_name = file
        extn = file[(len(file) - 4) : len(file)]
        if file.endswith(".mp4") or file.endswith(".mkv") or file.endswith(".srt"):
            print(f"Processing {file}")
            try:
                url = Find(file_new_name)
                file_new_name = file_new_name.replace(url, "")
            except:
                pass
            file_new_name = FormatStr(file_new_name.strip())
            year_str = (
                "(" + file_new_name[len(file_new_name) - 4 : len(file_new_name)] + ")"
            )
            file_new_name = file_new_name[0 : len(file_new_name) - 4]
            Final = file_new_name + year_str
            print("Derived: ", Final)
            movies = main_imdb(file_new_name + year_str)
            file_new_name = find_most_apt(Final, movies)  # Sometimes causes error
            file_new_name = removeIllegal(Final)
            Final = file_new_name + extn
            print("Most Apt: ", Final)
            print()
            # Rename from old -> new happens below
            path_new = os.path.join("Output", "Movies", file_new_name)
            try:
                os.mkdir("Output")
                os.mkdir("Output\\Movies")
                os.mkdir(path_new)
            except FileExistsError:
                pass
            try:
                ipdb.set_trace()
                os.rename(os.path.join(path, file), os.path.join(path_new, Final))
            except:
                print("Error - File Already Exist: " + file_new_name)
                FileFlag = 1
                ErrorFlag = 1
            # print(file)
    # Result Generation
    print("All Files Processed...")
    if FileFlag == 1:
        print("Solution: Try again after removing the above file(s) from Output folder")
    if ErrorFlag == 1:
        print(" File(s) Renamed and Organised Successfully")
    else:
        print("No Media File Found in Input Folder")
