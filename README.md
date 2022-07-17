# Movies Organizer

![GitHub top language](https://img.shields.io/github/languages/top/3h4x/movies-organizer)
![GitHub release (latest by date)](https://img.shields.io/github/v/release/3h4x/movies-organizer)
![GitHub last commit](https://img.shields.io/github/last-commit/3h4x/movies-organizer)
![GitHub](https://img.shields.io/github/license/3h4x/movies-organizer)
![GitHub Sponsors](https://img.shields.io/github/sponsors/3h4x)

#### Automatically bulk renames and organises your Movie and TV-Shows Library.<br>Ideal for maintaining your xbmc library.

## What it does

Running `./organizer.py` will show possible commands and flags:
```
Usage: organizer.py [OPTIONS] COMMAND [ARGS]...

  Rename Media Files

Options:
  --help  Show this message and exit.

Commands:
  movies  Rename Movies
  series  Rename TV Series
```
Currently renaming movies and series is supported.

Help for series:
```
Usage: organizer.py series [OPTIONS]

  Rename TV Series

Options:
  -p, --path TEXT  Path
  -f, --force      Automatically rename
  --help           Show this message and exit.
```

-  Movies are renamed and organized in format:
```
<Movie_name> (<year>)/<Movie_name> (<year>)
```

- All episodes of a series are moved inside a folder with their corresponding Season number in it:
```
<TV_Series_name>/S<Season_number>/S<Season_number>E<Episode_Number>
```

## Getting Started

### Prerequisites
What things you need to run the program:
- At least Python 3.8
- Install requirements `pip install -r requirements.txt`

### Development

- `pre-commit install --hook-type commit-msg`

<p align="center">
  Made with ❤️ by <a href="https://github.com/3h4x">3h4x</a></br>
  Loosely based on work of <a href="https://github.com/bearlike">bearlike</a>
</p>

![wave](http://cdn.thekrishna.in/img/common/border.png)
