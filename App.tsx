import React, { FormEvent, useEffect, useRef, useState } from 'react';
import Book3D, { getMostCommonCoverColor } from './Book3D';
import './App.css';

type BookDetails = {
  id: string;
  title: string;
  author: string;
  isbn: string;
  coverUrl?: string;
  openLibraryUrl: string;
  genre: string;
  published: string;
  pages: number;
  coverColor: string;
  accentColor: string;
  summary: string;
  shelfIndex: number;
  stackId?: string;
};

type BookOrientation = 'standing' | 'lying';

const shelfNames = ['Now Reading', 'Will Read', 'Done Reading'];
const fallbackColors = ['#315b52', '#254d68', '#704635', '#5b4330', '#47624b'];

const initialBooks: BookDetails[] = [
  {
    id: '9780307474278',
    title: 'The Da Vinci Code',
    author: 'Dan Brown',
    isbn: '9780307474278',
    openLibraryUrl: 'https://openlibrary.org/isbn/9780307474278',
    genre: 'Mystery thriller',
    published: '2003',
    pages: 489,
    coverColor: '#315b52',
    accentColor: '#d8ad62',
    summary: 'A symbologist follows a trail of clues hidden in works of art across Paris and beyond.',
    shelfIndex: 0,
  },
  {
    id: '9780743273565',
    title: 'The Great Gatsby',
    author: 'F. Scott Fitzgerald',
    isbn: '9780743273565',
    openLibraryUrl: 'https://openlibrary.org/isbn/9780743273565',
    genre: 'Literary fiction',
    published: '1925',
    pages: 180,
    coverColor: '#254d68',
    accentColor: '#e5c46e',
    summary: 'A summer on Long Island draws Nick Carraway into the glittering, troubled world of Jay Gatsby.',
    shelfIndex: 0,
  },
];

type OpenLibraryDocument = {
  key: string;
  title?: string;
  author_name?: string[];
  isbn?: string[];
  cover_i?: number;
  first_publish_year?: number;
  number_of_pages_median?: number;
};

function coverUrlFor(isbn: string, coverId?: number): string | undefined {
  if (coverId) return `https://covers.openlibrary.org/b/id/${coverId}-M.jpg?default=false`;
  if (isbn) return `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
  return undefined;
}

function titleColorForSpine(spineColor: string): string | undefined {
  const hex = spineColor.replace('#', '');
  if (!/^[\da-f]{6}$/i.test(hex)) return undefined;
  const channels = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const luminance = channels
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
  return luminance < 0.18 ? '#a6a6a1' : undefined;
}

function parseSavedBooks(): BookDetails[] {
  try {
    const saved = JSON.parse(window.localStorage.getItem('shelfBooks') || 'null') as unknown;
    if (Array.isArray(saved) && saved.every((book) => book && typeof book.id === 'string' && typeof book.title === 'string')) {
      return saved as BookDetails[];
    }
  } catch {
    return initialBooks;
  }
  return initialBooks;
}

function parseSavedOrientations(): Record<string, BookOrientation> {
  try {
    const saved = JSON.parse(window.localStorage.getItem('bookOrientations') || '{}') as Record<string, unknown>;
    return Object.entries(saved).reduce<Record<string, BookOrientation>>((orientations, [id, orientation]) => {
      if (orientation === 'standing' || orientation === 'lying') orientations[id] = orientation;
      return orientations;
    }, {});
  } catch {
    return {};
  }
}

function App() {
  const [selection, setSelection] = useState({
    selected: 0,
    from: 0,
    to: 0,
    animationKey: 0,
  });
  const [openBook, setOpenBook] = useState<BookDetails | null>(null);
  const [modalMode, setModalMode] = useState<'details' | 'edit'>('details');
  const [editMode, setEditMode] = useState(false);
  const [libraryBooks, setLibraryBooks] = useState<BookDetails[]>(parseSavedBooks);
  const [pendingOrientation, setPendingOrientation] = useState<BookOrientation>('standing');
  const [bookOrientations, setBookOrientations] = useState<Record<string, BookOrientation>>(parseSavedOrientations);
  const [bookSpineColors, setBookSpineColors] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<BookDetails[]>([]);
  const [searchStatus, setSearchStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [searchError, setSearchError] = useState('');
  const [draggedBookId, setDraggedBookId] = useState<string | null>(null);
  const [dropTargetBookId, setDropTargetBookId] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function updateViewportWidth() {
      setViewportWidth(window.innerWidth);
    }
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('bookOrientations', JSON.stringify(bookOrientations));
  }, [bookOrientations]);

  useEffect(() => {
    window.localStorage.setItem('shelfBooks', JSON.stringify(libraryBooks));
  }, [libraryBooks]);

  useEffect(() => {
    const images = libraryBooks.map((book) => {
      const coverImageUrl = book.coverUrl || coverUrlFor(book.isbn);
      if (!coverImageUrl) return null;
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => {
        const sampleCanvas = document.createElement('canvas');
        sampleCanvas.width = 48;
        sampleCanvas.height = 72;
        const context = sampleCanvas.getContext('2d');
        if (!context) return;

        try {
          context.drawImage(image, 0, 0, sampleCanvas.width, sampleCanvas.height);
          const imageData = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
          const commonColor = getMostCommonCoverColor(imageData.data);
          if (commonColor !== null) {
            setBookSpineColors((colors) => ({
              ...colors,
              [book.id]: `#${commonColor.toString(16).padStart(6, '0')}`,
            }));
          }
        } catch {
          // Keep the configured book color when the remote cover cannot be sampled.
        }
      };
      image.src = coverImageUrl.replace('-M.jpg', '-L.jpg');
      return image;
    });

    return () => {
      images.forEach((image) => {
        if (image) image.onload = null;
      });
    };
  }, [libraryBooks]);

  async function searchOpenLibrary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchStatus('loading');
    setSearchError('');
    setSearchResults([]);

    try {
      const params = new URLSearchParams({
        q: query,
        limit: '8',
        fields: 'key,title,author_name,isbn,cover_i,first_publish_year,number_of_pages_median',
      });
      const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Search is unavailable right now. Please try again.');
      const data = await response.json() as { docs?: OpenLibraryDocument[] };
      const results = (data.docs || []).filter((document) => document.key && document.title).map((document, index) => {
        const isbn = document.isbn?.[0] || '';
        const bookCoverUrl = coverUrlFor(isbn, document.cover_i);
        return {
          id: document.key,
          title: document.title || 'Untitled',
          author: document.author_name?.[0] || 'Unknown author',
          isbn,
          coverUrl: bookCoverUrl,
          openLibraryUrl: `https://openlibrary.org${document.key}`,
          genre: 'Book',
          published: document.first_publish_year ? String(document.first_publish_year) : 'Unknown',
          pages: document.number_of_pages_median || 0,
          coverColor: fallbackColors[index % fallbackColors.length],
          accentColor: '#d8ad62',
          summary: 'No summary is available for this edition.',
          shelfIndex: selection.selected,
        };
      });
      setSearchResults(results);
      setSearchStatus('success');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setSearchError(error instanceof Error ? error.message : 'Search failed. Please try again.');
      setSearchStatus('error');
    }
  }

  function addBookToActiveShelf(book: BookDetails) {
    const exists = libraryBooks.some((savedBook) => savedBook.id === book.id
      || (book.isbn && savedBook.isbn === book.isbn));
    if (exists) return;
    setLibraryBooks((current) => [...current, { ...book, shelfIndex: selection.selected }]);
  }

  useEffect(() => {
    if (!openBook) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenBook(null);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openBook]);

  function selectShelf(index: number) {
    setSelection((current) => ({
      selected: index,
      from: current.selected,
      to: index,
      animationKey: current.animationKey + 1,
    }));
  }

  function showBookDetails(book: BookDetails) {
    setOpenBook(book);
    setModalMode('details');
  }

  function editBookOrientation(book: BookDetails) {
    setOpenBook(book);
    setModalMode('edit');
    setPendingOrientation(bookOrientations[book.id] || 'standing');
  }

  function saveBookOrientation() {
    if (!openBook) return;
    setBookOrientations((current) => ({ ...current, [openBook.id]: pendingOrientation }));
    if (pendingOrientation === 'standing') {
      setLibraryBooks((current) => current.map((book) => {
        if (book.id !== openBook.id || !book.stackId) return book;
        const { stackId, ...unstackedBook } = book;
        return unstackedBook;
      }));
    }
    setOpenBook(null);
  }

  function reorderShelfBooks(draggedId: string, targetId: string) {
    setLibraryBooks((current) => {
      const shelfBooks = current.filter((book) => book.shelfIndex === selection.selected);
      const fromIndex = shelfBooks.findIndex((book) => book.id === draggedId);
      const toIndex = shelfBooks.findIndex((book) => book.id === targetId);
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;

      const draggedBookData = shelfBooks[fromIndex];
      const targetBook = shelfBooks[toIndex];
      if (bookOrientations[draggedId] === 'lying' && bookOrientations[targetId] === 'lying') {
        const draggedGroup = shelfBooks.filter((book) => draggedBookData.stackId
          ? book.stackId === draggedBookData.stackId
          : book.id === draggedBookData.id);
        const targetGroup = shelfBooks.filter((book) => targetBook.stackId
          ? book.stackId === targetBook.stackId
          : book.id === targetBook.id);
        if (draggedBookData.stackId && draggedBookData.stackId === targetBook.stackId) {
          const stackOrder = draggedGroup.slice();
          const [movingBook] = stackOrder.splice(stackOrder.findIndex((book) => book.id === draggedId), 1);
          const targetStackIndex = stackOrder.findIndex((book) => book.id === targetId);
          stackOrder.splice(targetStackIndex, 0, movingBook);
          const stackIds = new Set(draggedGroup.map((book) => book.id));
          let stackBookIndex = 0;
          return current.map((book) => book.shelfIndex === selection.selected && stackIds.has(book.id)
            ? stackOrder[stackBookIndex++]
            : book);
        }
        if (targetGroup.length >= 3) return current;

        const targetStackId = targetBook.stackId || `stack-${targetBook.id}`;
        const targetIds = new Set(targetGroup.map((book) => book.id));
        const sourceStackIds = new Set(draggedGroup.map((book) => book.id));
        let updatedBooks: BookDetails[] = [];
        current.forEach((book) => {
          if (book.id === draggedId) return;
          if (targetIds.has(book.id)) {
            updatedBooks.push({ ...book, stackId: targetStackId });
            if (book.id === targetGroup[targetGroup.length - 1].id) {
              updatedBooks.push({ ...draggedBookData, stackId: targetStackId });
            }
            return;
          }
          if (sourceStackIds.has(book.id) && draggedBookData.stackId && draggedGroup.length === 2) {
            const unstackedBook = { ...book, stackId: undefined };
            updatedBooks.push(unstackedBook);
            return;
          }
          updatedBooks.push(book);
        });
        if (!targetIds.has(targetGroup[targetGroup.length - 1].id)) return current;
        return updatedBooks;
      }

      const [draggedBook] = shelfBooks.splice(fromIndex, 1);
      shelfBooks.splice(toIndex, 0, draggedBook);
      let shelfBookIndex = 0;
      return current.map((book) => book.shelfIndex === selection.selected
        ? shelfBooks[shelfBookIndex++]
        : book);
    });
  }

  const activeBooks = libraryBooks.filter((book) => book.shelfIndex === selection.selected);
  const shelfItems = activeBooks.reduce<Array<{ stackId?: string; books: BookDetails[] }>>((items, book) => {
    const stack = book.stackId ? items.find((item) => item.stackId === book.stackId) : undefined;
    if (stack) stack.books.push(book);
    else items.push({ stackId: book.stackId, books: [book] });
    return items;
  }, []);
  const shelfWidth = Math.max(1, Math.min(1290, viewportWidth - 48) - 16);
  const shelfHeight = Math.min(330, Math.max(0, (viewportWidth - 64) * 0.259));
  const shelfRows: Array<typeof shelfItems> = [];
  let currentShelfRow: typeof shelfItems = [];
  let currentRowWidth = 0;
  shelfItems.forEach((item) => {
    const itemWidth = bookOrientations[item.books[0].id] === 'lying'
      ? shelfHeight
      : shelfWidth * 0.0833;
    if (currentShelfRow.length > 0 && currentRowWidth + itemWidth > shelfWidth) {
      shelfRows.push(currentShelfRow);
      currentShelfRow = [];
      currentRowWidth = 0;
    }
    currentShelfRow.push(item);
    currentRowWidth += itemWidth;
  });
  if (currentShelfRow.length > 0) shelfRows.push(currentShelfRow);
  if (shelfRows.length === 0) shelfRows.push([]);

  return (
    <div className="App">
      <form className="book-search" role="search" onSubmit={searchOpenLibrary}>
        <label className="visually-hidden" htmlFor="book-search-input">Search Open Library</label>
        <input
          id="book-search-input"
          type="search"
          value={searchQuery}
          placeholder="Search books by title or author"
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <button type="submit" disabled={searchStatus === 'loading' || !searchQuery.trim()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.4" /><path d="m16 16 4.5 4.5" /></svg>
          {searchStatus === 'loading' ? 'Searching' : 'Search'}
        </button>
      </form>
      {(searchStatus === 'loading' || searchStatus === 'error' || searchResults.length > 0) && (
        <section className="search-results" aria-live="polite" aria-label="Book search results">
          <div className="search-results-heading">
            <h2>{searchStatus === 'loading' ? 'Searching Open Library' : 'Search results'}</h2>
            <button type="button" className="search-results-close" aria-label="Clear search results" onClick={() => {
              setSearchResults([]);
              setSearchStatus('idle');
              setSearchError('');
            }}>×</button>
          </div>
          {searchStatus === 'loading' && <p className="search-message">Looking through the catalog…</p>}
          {searchStatus === 'error' && <p className="search-message search-error">{searchError}</p>}
          {searchStatus === 'success' && searchResults.length === 0 && (
            <p className="search-message">No books found. Try another title or author.</p>
          )}
          {searchResults.map((book) => {
            const alreadyAdded = libraryBooks.some((savedBook) => savedBook.id === book.id
              || (book.isbn && savedBook.isbn === book.isbn));
            return (
              <article className="search-result" key={book.id}>
                {book.coverUrl ? (
                  <img className="search-result-cover" src={book.coverUrl} alt="" />
                ) : (
                  <span className="search-result-cover search-result-no-cover" aria-hidden="true">BOOK</span>
                )}
                <div className="search-result-info">
                  <h3>{book.title}</h3>
                  <p>{book.author}{book.published !== 'Unknown' ? ` · ${book.published}` : ''}</p>
                </div>
                <button
                  type="button"
                  className="search-result-add"
                  disabled={alreadyAdded}
                  onClick={() => addBookToActiveShelf(book)}
                >
                  {alreadyAdded ? 'Added' : `Add to ${shelfNames[selection.selected]}`}
                </button>
              </article>
            );
          })}
        </section>
      )}
      <div className="shelf-header">
        <div className="shelf-type-container" role="group" aria-label="Reading shelves">
          <span
            key={selection.animationKey}
            aria-hidden="true"
            className={`shelf-selection-fill${selection.animationKey ? ' shelf-selection-fill-animated' : ''}`}
            style={{
              '--slide-from': `${selection.from * 100}%`,
              '--slide-to': `${selection.to * 100}%`,
            } as React.CSSProperties}
          />
          {shelfNames.map((shelf, index) => (
            <button
              key={shelf}
              type="button"
              aria-pressed={selection.selected === index}
              className={`shelf-type${selection.selected === index ? ' shelf-selected' : ''}`}
              onClick={() => selectShelf(index)}
            >
              {shelf} ({libraryBooks.filter((book) => book.shelfIndex === index).length})
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`edit-mode-toggle${editMode ? ' is-on' : ''}`}
          role="switch"
          aria-checked={editMode}
          onClick={() => setEditMode((enabled) => !enabled)}
        >
          <span className="edit-mode-label">Edit mode</span>
          <span className="toggle-track" aria-hidden="true"><span className="toggle-thumb" /></span>
        </button>
      </div>
      <div className="book-shelf">
        {shelfRows.map((row, rowIndex) => (
          <div className="shelf" aria-label={`${shelfNames[selection.selected]} shelf ${rowIndex + 1}`} key={`shelf-row-${rowIndex}`}>
            {row.map((item) => {
            const representative = item.books[0];
            const isLyingStack = item.books.length > 1;
            return (
            <div
              className={`book-item${bookOrientations[representative.id] === 'lying' ? ' book-item-lying' : ''}${isLyingStack ? ' book-item-stacked' : ''}${item.books.some((book) => draggedBookId === book.id) ? ' is-dragging' : ''}${item.books.some((book) => dropTargetBookId === book.id) ? ' is-drop-target' : ''}`}
              key={item.stackId || representative.id}
              onDragOver={editMode ? (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTargetBookId(representative.id);
              } : undefined}
              onDrop={editMode ? (event) => {
                event.preventDefault();
                const draggedId = event.dataTransfer.getData('text/plain');
                if (draggedId) reorderShelfBooks(draggedId, representative.id);
                setDraggedBookId(null);
                setDropTargetBookId(null);
              } : undefined}
              onDragEnd={() => {
                setDraggedBookId(null);
                setDropTargetBookId(null);
              }}
            >
              {item.books.map((book, index) => {
                const spineColor = bookSpineColors[book.id] || book.coverColor;
                const titleColor = titleColorForSpine(spineColor);
                return (
                  <React.Fragment key={book.id}>
                  <button
                    type="button"
                    className={`book${bookOrientations[book.id] === 'lying' ? ' book-lying' : ''}`}
                    draggable={editMode}
                    style={{
                      backgroundColor: spineColor,
                      borderLeftColor: spineColor,
                      ...(bookOrientations[book.id] === 'lying' ? { bottom: `${index * 32.16}%`, zIndex: index + 1 } : {}),
                    }}
                    onDragStart={editMode ? (event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', book.id);
                      setDraggedBookId(book.id);
                    } : undefined}
                    onDragOver={editMode ? (event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      setDropTargetBookId(book.id);
                    } : undefined}
                    onDrop={editMode ? (event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const draggedId = event.dataTransfer.getData('text/plain');
                      if (draggedId) reorderShelfBooks(draggedId, book.id);
                      setDraggedBookId(null);
                      setDropTargetBookId(null);
                    } : undefined}
                    onClick={() => (editMode ? editBookOrientation(book) : showBookDetails(book))}
                  >
                    <span className="book-title" style={titleColor ? { color: titleColor } : undefined}>{book.title}</span>
                  </button>
                  {editMode && (
                    <button
                      type="button"
                      className="book-edit-button"
                      aria-label={`Edit ${book.title} orientation`}
                      title={`Edit ${book.title} orientation`}
                      style={bookOrientations[book.id] === 'lying' ? {
                        top: `${67.84 - index * 32.16}%`,
                        transform: 'none',
                      } : undefined}
                      onClick={() => editBookOrientation(book)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 16.8V20h3.2L18.6 8.6l-3.2-3.2L4 16.8Zm17.7-10.1a.85.85 0 0 0 0-1.2l-2-2a.85.85 0 0 0-1.2 0l-1.6 1.6 3.2 3.2 1.6-1.6Z" />
                      </svg>
                    </button>
                  )}
                  </React.Fragment>
                );
              })}
            </div>
          );
          })}
            {activeBooks.length === 0 && rowIndex === 0 && <p className="empty-shelf">This shelf is empty.</p>}
          </div>
        ))}
        <div className="shelf shelf-empty-lower" aria-label="Empty lower shelf" />
      </div>
      {openBook && (
        <div
          className="book-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpenBook(null);
          }}
        >
          <section
            className="book-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-modal-title"
          >
            <button
              type="button"
              className="book-modal-close"
              aria-label="Close book details"
              onClick={() => setOpenBook(null)}
            >
              <span aria-hidden="true">×</span>
            </button>
            <div className="book-modal-art">
              <Book3D
                title={openBook.title}
                author={openBook.author}
                isbn={openBook.isbn}
                coverUrl={openBook.coverUrl}
                coverColor={openBook.coverColor}
                accentColor={openBook.accentColor}
              />
              <a
                className="book-art-caption"
                href={openBook.openLibraryUrl}
                target="_blank"
                rel="noreferrer"
              >
                COVER VIA OPEN LIBRARY
              </a>
            </div>
            <div className="book-modal-details">
              <p className="book-modal-eyebrow">{modalMode === 'edit' ? 'EDIT BOOK' : 'BOOK DETAILS'}</p>
              <h2 id="book-modal-title">{openBook.title}</h2>
              <p className="book-modal-author">by {openBook.author}</p>
              <p className="book-modal-summary">{openBook.summary}</p>
              {modalMode === 'edit' && (
                <fieldset className="orientation-editor">
                  <legend>Bookshelf orientation</legend>
                  <div className="orientation-options">
                    <button
                      type="button"
                      className={pendingOrientation === 'standing' ? 'orientation-option selected' : 'orientation-option'}
                      aria-pressed={pendingOrientation === 'standing'}
                      onClick={() => setPendingOrientation('standing')}
                    >
                      <span className="orientation-icon standing-icon" aria-hidden="true" />
                      Standing
                    </button>
                    <button
                      type="button"
                      className={pendingOrientation === 'lying' ? 'orientation-option selected' : 'orientation-option'}
                      aria-pressed={pendingOrientation === 'lying'}
                      onClick={() => setPendingOrientation('lying')}
                    >
                      <span className="orientation-icon lying-icon" aria-hidden="true" />
                      Lying down
                    </button>
                  </div>
                  <div className="orientation-actions">
                    <button type="button" className="orientation-cancel" onClick={() => setOpenBook(null)}>
                      Cancel
                    </button>
                    <button type="button" className="orientation-save" onClick={saveBookOrientation}>
                      Save
                    </button>
                  </div>
                </fieldset>
              )}
              <dl className="book-stats">
                <div>
                  <dt>Genre</dt>
                  <dd>{openBook.genre}</dd>
                </div>
                <div>
                  <dt>First published</dt>
                  <dd>{openBook.published}</dd>
                </div>
                <div>
                  <dt>Length</dt>
                  <dd>{openBook.pages} pages</dd>
                </div>
                <div>
                  <dt>Shelf</dt>
                  <dd>{shelfNames[openBook.shelfIndex]}</dd>
                </div>
              </dl>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
