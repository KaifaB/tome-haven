import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
jest.mock('three', () => ({}));
import App from './App';
import { getMostCommonCoverColor } from './Book3D';

test('finds the most common quantized color in a cover sample', () => {
  const pixels = new Uint8ClampedArray([
    28, 72, 112, 255,
    29, 73, 113, 255,
    27, 71, 111, 255,
    220, 180, 90, 255,
    220, 180, 90, 255,
  ]);

  expect(getMostCommonCoverColor(pixels)).toBe(0x1d4971);
  expect(getMostCommonCoverColor(new Uint8ClampedArray())).toBeNull();
});

test('selects the shelf that is clicked', () => {
  render(<App />);

  const nowReading = screen.getByRole('button', { name: 'Now Reading (0)' });
  const willRead = screen.getByRole('button', { name: 'Will Read (0)' });
  const doneReading = screen.getByRole('button', { name: 'Done Reading (0)' });
  const selectionFill = document.querySelector('.shelf-selection-fill');

  expect(nowReading).toHaveClass('shelf-selected');
  expect(selectionFill).toHaveStyle({ '--slide-to': '0%' });

  fireEvent.click(willRead);

  expect(nowReading).not.toHaveClass('shelf-selected');
  expect(willRead).toHaveClass('shelf-selected');
  expect(doneReading).not.toHaveClass('shelf-selected');
  expect(document.querySelector('.shelf-selection-fill')).toHaveStyle({ '--slide-to': '100%' });
  expect(document.querySelector('.shelf-selection-fill')).toHaveClass('shelf-selection-fill-animated');
});

test('creates another shelf row when the current shelf is full', () => {
  window.localStorage.clear();
  const books = Array.from({ length: 13 }, (_, index) => ({
    id: `row-book-${index + 1}`,
    title: `Row Book ${index + 1}`,
    author: 'Test Author',
    isbn: '',
    openLibraryUrl: 'https://openlibrary.org',
    genre: 'Book',
    published: '2024',
    pages: 100,
    coverColor: '#315b52',
    accentColor: '#d8ad62',
    summary: 'Test book.',
    shelfIndex: 0,
  }));
  window.localStorage.setItem('shelfBooks', JSON.stringify(books));
  render(<App />);

  const shelves = document.querySelectorAll('.book-shelf > .shelf');
  expect(shelves).toHaveLength(3);
  expect(shelves[0].querySelectorAll('.book-item')).toHaveLength(12);
  expect(shelves[1].querySelectorAll('.book-item')).toHaveLength(1);
  expect(shelves[2].querySelectorAll('.book-item')).toHaveLength(0);
});

test('uses muted grey title text only on dark book spines', () => {
  window.localStorage.clear();
  const books = [
    { id: 'dark-spine', title: 'Dark Spine', coverColor: '#254d68' },
    { id: 'light-spine', title: 'Light Spine', coverColor: '#d8caa0' },
  ].map((book) => ({
    ...book,
    author: 'Test Author',
    isbn: '',
    openLibraryUrl: 'https://openlibrary.org',
    genre: 'Book',
    published: '2024',
    pages: 100,
    accentColor: '#d8ad62',
    summary: 'Test book.',
    shelfIndex: 0,
  }));
  window.localStorage.setItem('shelfBooks', JSON.stringify(books));
  render(<App />);

  expect(screen.getByText('Dark Spine')).toHaveStyle({ color: '#a6a6a1' });
  expect(screen.getByText('Light Spine')).not.toHaveStyle({ color: '#a6a6a1' });
});

test('opens the clicked book details and closes with Escape', () => {
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'The Great Gatsby' }));

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'The Great Gatsby' })).toBeInTheDocument();
  expect(screen.getByText('F. Scott Fitzgerald')).toBeInTheDocument();
  expect(screen.getByText('180 pages')).toBeInTheDocument();
  expect(screen.getByLabelText('3D cover of The Great Gatsby')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'COVER VIA OPEN LIBRARY' })).toHaveAttribute(
    'href',
    'https://openlibrary.org/isbn/9780743273565',
  );

  fireEvent.keyDown(window, { key: 'Escape' });

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('saves a book orientation from edit mode to the shelf', () => {
  window.localStorage.clear();
  render(<App />);

  fireEvent.click(screen.getByRole('switch', { name: /edit mode/i }));

  expect(screen.getByRole('button', { name: 'Edit The Great Gatsby orientation' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'The Great Gatsby' }));

  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Lying down' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'The Great Gatsby' })).toHaveClass('book-lying');
  expect(JSON.parse(window.localStorage.getItem('bookOrientations') || '{}')).toEqual({
    '9780743273565': 'lying',
  });
});

test('shows an edit button for every book in a lying stack', () => {
  window.localStorage.clear();
  const books = Array.from({ length: 3 }, (_, index) => ({
    id: `lying-book-${index + 1}`,
    title: `Lying Book ${index + 1}`,
    author: 'Test Author',
    isbn: '',
    openLibraryUrl: 'https://openlibrary.org',
    genre: 'Book',
    published: '2024',
    pages: 100,
    coverColor: '#315b52',
    accentColor: '#d8ad62',
    summary: 'Test book.',
    shelfIndex: 0,
    stackId: 'lying-stack',
  }));
  window.localStorage.setItem('shelfBooks', JSON.stringify(books));
  window.localStorage.setItem('bookOrientations', JSON.stringify(
    Object.fromEntries(books.map((book) => [book.id, 'lying'])),
  ));
  render(<App />);

  fireEvent.click(screen.getByRole('switch', { name: /edit mode/i }));

  books.forEach((book) => {
    expect(screen.getByRole('button', { name: `Edit ${book.title} orientation` })).toBeInTheDocument();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Edit Lying Book 2 orientation' }));
  expect(screen.getByRole('heading', { name: 'Lying Book 2' })).toBeInTheDocument();
});

test('reorders books on the active shelf by dragging in edit mode', () => {
  window.localStorage.clear();
  render(<App />);

  fireEvent.click(screen.getByRole('switch', { name: /edit mode/i }));

  const draggedBook = screen.getByRole('button', { name: 'The Great Gatsby' }).closest('.book-item');
  const targetBook = screen.getByRole('button', { name: 'The Da Vinci Code' }).closest('.book-item');
  const dataTransfer = {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: jest.fn(),
    getData: jest.fn().mockReturnValue('9780743273565'),
  };

  expect(draggedBook).toHaveAttribute('draggable', 'true');
  fireEvent.dragStart(draggedBook as HTMLElement, { dataTransfer });
  fireEvent.dragOver(targetBook as HTMLElement, { dataTransfer });
  fireEvent.drop(targetBook as HTMLElement, { dataTransfer });

  expect(Array.from(document.querySelectorAll('.shelf .book-title')).map((title) => title.textContent)).toEqual([
    'The Great Gatsby',
    'The Da Vinci Code',
  ]);
  expect(JSON.parse(window.localStorage.getItem('shelfBooks') || '[]').map((book: { id: string }) => book.id)).toEqual([
    '9780743273565',
    '9780307474278',
  ]);
});

test('stacks lying books up to a maximum of three', () => {
  window.localStorage.clear();
  const books = Array.from({ length: 4 }, (_, index) => ({
    id: `stack-book-${index + 1}`,
    title: `Stack Book ${index + 1}`,
    author: 'Test Author',
    isbn: '',
    openLibraryUrl: 'https://openlibrary.org',
    genre: 'Book',
    published: '2024',
    pages: 100,
    coverColor: '#315b52',
    accentColor: '#d8ad62',
    summary: 'Test book.',
    shelfIndex: 0,
  }));
  window.localStorage.setItem('shelfBooks', JSON.stringify(books));
  window.localStorage.setItem('bookOrientations', JSON.stringify(
    Object.fromEntries(books.map((book) => [book.id, 'lying'])),
  ));
  render(<App />);
  fireEvent.click(screen.getByRole('switch', { name: /edit mode/i }));

  const dragBookTo = (draggedTitle: string, targetTitle: string) => {
    const dataTransfer = {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: jest.fn(),
      getData: jest.fn().mockReturnValue(`stack-book-${draggedTitle.slice(-1)}`),
    };
    const draggedBook = screen.getByRole('button', { name: draggedTitle });
    const targetItem = screen.getByRole('button', { name: targetTitle }).closest('.book-item');
    fireEvent.dragStart(draggedBook, { dataTransfer });
    fireEvent.dragOver(targetItem as HTMLElement, { dataTransfer });
    fireEvent.drop(targetItem as HTMLElement, { dataTransfer });
  };

  dragBookTo('Stack Book 2', 'Stack Book 1');
  dragBookTo('Stack Book 3', 'Stack Book 1');
  dragBookTo('Stack Book 4', 'Stack Book 1');

  expect(document.querySelectorAll('.book-item-stacked .book')).toHaveLength(3);
  expect(document.querySelectorAll('.shelf .book-item')).toHaveLength(2);
  const savedBooks = JSON.parse(window.localStorage.getItem('shelfBooks') || '[]') as Array<{
    id: string;
    stackId?: string;
  }>;
  const stackIds = savedBooks.filter((book) => book.stackId).map((book) => book.id);
  expect(stackIds).toHaveLength(3);
  expect(savedBooks.find((book) => book.id === 'stack-book-4')?.stackId).toBeUndefined();
});

test('reorders books within a lying stack', () => {
  window.localStorage.clear();
  const books = Array.from({ length: 3 }, (_, index) => ({
    id: `layer-book-${index + 1}`,
    title: `Layer Book ${index + 1}`,
    author: 'Test Author',
    isbn: '',
    openLibraryUrl: 'https://openlibrary.org',
    genre: 'Book',
    published: '2024',
    pages: 100,
    coverColor: '#315b52',
    accentColor: '#d8ad62',
    summary: 'Test book.',
    shelfIndex: 0,
    stackId: 'layer-stack',
  }));
  window.localStorage.setItem('shelfBooks', JSON.stringify(books));
  window.localStorage.setItem('bookOrientations', JSON.stringify(
    Object.fromEntries(books.map((book) => [book.id, 'lying'])),
  ));
  render(<App />);
  fireEvent.click(screen.getByRole('switch', { name: /edit mode/i }));

  const dataTransfer = {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: jest.fn(),
    getData: jest.fn().mockReturnValue('layer-book-1'),
  };
  fireEvent.dragStart(screen.getByRole('button', { name: 'Layer Book 1' }), { dataTransfer });
  fireEvent.dragOver(screen.getByRole('button', { name: 'Layer Book 3' }), { dataTransfer });
  fireEvent.drop(screen.getByRole('button', { name: 'Layer Book 3' }), { dataTransfer });

  const savedBooks = JSON.parse(window.localStorage.getItem('shelfBooks') || '[]') as Array<{ id: string }>;
  expect(savedBooks.map((book) => book.id)).toEqual([
    'layer-book-2',
    'layer-book-1',
    'layer-book-3',
  ]);
  expect(document.querySelectorAll('.book-item-stacked .book')).toHaveLength(3);
});

test('moves a book between non-adjacent stacks without moving the whole source stack', () => {
  window.localStorage.clear();
  const books = [
    { id: 'source-book-1', stackId: 'source-stack', title: 'Source Book 1' },
    { id: 'source-book-2', stackId: 'source-stack', title: 'Source Book 2' },
    { id: 'middle-book', title: 'Middle Book' },
    { id: 'target-book-1', stackId: 'target-stack', title: 'Target Book 1' },
    { id: 'target-book-2', stackId: 'target-stack', title: 'Target Book 2' },
  ].map((book) => ({
    ...book,
    author: 'Test Author',
    isbn: '',
    openLibraryUrl: 'https://openlibrary.org',
    genre: 'Book',
    published: '2024',
    pages: 100,
    coverColor: '#315b52',
    accentColor: '#d8ad62',
    summary: 'Test book.',
    shelfIndex: 0,
  }));
  window.localStorage.setItem('shelfBooks', JSON.stringify(books));
  window.localStorage.setItem('bookOrientations', JSON.stringify(
    Object.fromEntries(books.filter((book) => book.id !== 'middle-book').map((book) => [book.id, 'lying'])),
  ));
  render(<App />);
  fireEvent.click(screen.getByRole('switch', { name: /edit mode/i }));

  const dataTransfer = {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: jest.fn(),
    getData: jest.fn().mockReturnValue('source-book-1'),
  };
  fireEvent.dragStart(screen.getByRole('button', { name: 'Source Book 1' }), { dataTransfer });
  fireEvent.dragOver(screen.getByRole('button', { name: 'Target Book 1' }), { dataTransfer });
  fireEvent.drop(screen.getByRole('button', { name: 'Target Book 1' }), { dataTransfer });

  const savedBooks = JSON.parse(window.localStorage.getItem('shelfBooks') || '[]') as Array<{
    id: string;
    stackId?: string;
  }>;
  expect(savedBooks.find((book) => book.id === 'source-book-1')?.stackId).toBe('target-stack');
  expect(savedBooks.find((book) => book.id === 'source-book-2')?.stackId).toBeUndefined();
  expect(savedBooks.find((book) => book.id === 'target-book-2')?.stackId).toBe('target-stack');
  expect(document.querySelectorAll('.book-item-stacked .book')).toHaveLength(3);
});

test('searches Open Library and adds a result to the active shelf', async () => {
  window.localStorage.clear();
  const originalFetch = global.fetch;
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      docs: [{
        key: '/works/OL123W',
        title: 'Parable of the Sower',
        author_name: ['Octavia E. Butler'],
        isbn: ['9780446675505'],
        cover_i: 12345,
        first_publish_year: 1993,
        number_of_pages_median: 345,
      }],
    }),
  }) as jest.Mock;

  try {
    render(<App />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search Open Library' }), {
      target: { value: 'Parable of the Sower' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(await screen.findByRole('heading', { name: 'Parable of the Sower' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Will Read (0)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add to Will Read' }));

    expect(screen.getByRole('button', { name: 'Will Read (1)' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Parable of the Sower' })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('shelfBooks') || '[]')).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: '/works/OL123W', shelfIndex: 1 })]),
    );
  } finally {
    global.fetch = originalFetch;
  }
});
