// Built-in Heads Up! decks.
//
// These ship with the app so a game can start instantly, offline, with no API
// key. Words are chosen to be clue-able out loud in a few seconds by a room of
// people: famous enough that most players know them, specific enough that the
// clues are not boring.

export type Deck = {
  id: string
  name: string
  emoji: string
  description: string
  words: string[]
}

export const decks: Deck[] = [
  {
    id: 'celebrities',
    name: 'Celebrities',
    emoji: '🌟',
    description: 'Famous faces everyone can describe',
    words: [
      'Beyoncé', 'Keanu Reeves', 'Oprah Winfrey', 'Elon Musk', 'Taylor Swift',
      'Dwayne Johnson', 'Rihanna', 'Snoop Dogg', 'Lady Gaga', 'Tom Cruise',
      'Serena Williams', 'David Attenborough', 'Zendaya', 'Gordon Ramsay', 'Adele',
      'Leonardo DiCaprio', 'Billie Eilish', 'Morgan Freeman', 'Ariana Grande', 'Bill Gates',
      'Emma Watson', 'Kanye West', 'Meryl Streep', 'Cristiano Ronaldo', 'Dolly Parton',
      'Timothée Chalamet', 'Michelle Obama', 'Jackie Chan', 'Cardi B', 'Hugh Jackman',
      'Greta Thunberg', 'Ryan Reynolds', 'Nicki Minaj', 'Steven Spielberg', 'Shakira',
      'Idris Elba', 'Kim Kardashian', 'Jeff Bezos', 'Jennifer Lopez', 'Brad Pitt',
      'Doja Cat', 'Simone Biles', 'Samuel L. Jackson', 'Ed Sheeran', 'Angelina Jolie',
    ],
  },
  {
    id: 'animals',
    name: 'Animals',
    emoji: '🦒',
    description: 'Easy to act out, hard to say',
    words: [
      'Giraffe', 'Penguin', 'Octopus', 'Kangaroo', 'Hedgehog',
      'Flamingo', 'Sloth', 'Chameleon', 'Walrus', 'Peacock',
      'Koala', 'Rhinoceros', 'Jellyfish', 'Meerkat', 'Platypus',
      'Owl', 'Hippopotamus', 'Panda', 'Cheetah', 'Seahorse',
      'Woodpecker', 'Porcupine', 'Crocodile', 'Bat', 'Camel',
      'Snail', 'Gorilla', 'Dolphin', 'Ostrich', 'Raccoon',
      'Squirrel', 'Toucan', 'Lobster', 'Zebra', 'Skunk',
      'Pelican', 'Armadillo', 'Firefly', 'Narwhal', 'Llama',
      'Praying mantis', 'Great white shark', 'Bumblebee', 'Tortoise', 'Wolf',
    ],
  },
  {
    id: 'movies',
    name: 'Movies',
    emoji: '🎬',
    description: 'Quote it, hum it, act it out',
    words: [
      'Titanic', 'Jurassic Park', 'The Lion King', 'Jaws', 'Frozen',
      'The Matrix', 'Forrest Gump', 'Home Alone', 'Shrek', 'Inception',
      'Finding Nemo', 'The Godfather', 'Toy Story', 'Avatar', 'Rocky',
      'Mean Girls', 'The Shining', 'Back to the Future', 'Gladiator', 'Up',
      'Pulp Fiction', 'Harry Potter', 'Star Wars', 'The Hangover', 'Ratatouille',
      'Jumanji', 'Mamma Mia', 'Groundhog Day', 'Black Panther', 'The Notebook',
      'Ghostbusters', 'Interstellar', 'Despicable Me', 'Fight Club', 'Cast Away',
      'The Truman Show', 'Mission: Impossible', 'La La Land', 'Barbie', 'Oppenheimer',
      'The Devil Wears Prada', 'Free Willy', 'Moana', 'Parasite', 'Top Gun',
    ],
  },
  {
    id: 'accents',
    name: 'Accents & Impressions',
    emoji: '🗣️',
    description: 'Say the clue in the voice, no naming it',
    words: [
      'Pirate', 'Robot', 'Australian', 'Texan cowboy', 'French waiter',
      'Surfer dude', 'British royal', 'Sports commentator', 'Movie trailer voice', 'Toddler',
      'Opera singer', 'Drill sergeant', 'Nervous first date', 'Airline pilot', 'News anchor',
      'Yoga instructor', 'Sat nav', 'Auctioneer', 'Villain monologue', 'Ghost',
      'Grumpy neighbour', 'Excited puppy owner', 'Golf whisperer', 'Italian chef', 'Valley girl',
      'Wrestling announcer', 'Meditation app', 'Angry chef', 'Tour guide', 'Radio DJ',
      'Bond villain', 'Southern grandma', 'Nature documentary', 'Motivational speaker', 'Robot in love',
      'Weather forecaster', 'Whispering librarian', 'Confused tourist', 'Fortune teller', 'Elf',
      'Salesperson', 'Referee', 'Detective', 'Rapper', 'Wizard',
    ],
  },
  {
    id: 'characters',
    name: 'Famous Characters',
    emoji: '🦸',
    description: 'Fictional people everyone knows',
    words: [
      'Batman', 'Homer Simpson', 'Sherlock Holmes', 'Darth Vader', 'Elsa',
      'Spider-Man', 'Winnie the Pooh', 'Gandalf', 'Mickey Mouse', 'Hermione Granger',
      'Yoda', 'SpongeBob SquarePants', 'Wonder Woman', 'Shrek', 'James Bond',
      'Indiana Jones', 'Scooby-Doo', 'Mario', 'The Joker', 'Buzz Lightyear',
      'Katniss Everdeen', 'Bugs Bunny', 'Iron Man', 'Cinderella', 'Willy Wonka',
      'Pikachu', 'Captain America', 'Dracula', 'Peter Pan', 'The Grinch',
      'Tarzan', 'Frankenstein', 'Woody', 'Robin Hood', 'Ariel',
      'Godzilla', 'Bart Simpson', 'Gollum', 'Tinker Bell', 'Hulk',
      'Sonic the Hedgehog', 'Cruella de Vil', 'Snow White', 'Thanos', 'Popeye',
    ],
  },
  {
    id: 'sports',
    name: 'Sports & Moves',
    emoji: '⚽',
    description: 'Best played standing up',
    words: [
      'Slam dunk', 'Penalty kick', 'Home run', 'Marathon', 'Sumo wrestling',
      'Figure skating', 'Bungee jumping', 'Surfing', 'Golf swing', 'Yoga',
      'Pole vault', 'Curling', 'Skateboarding', 'Boxing', 'Rock climbing',
      'Synchronised swimming', 'Formula 1', 'Table tennis', 'Archery', 'Fencing',
      'Snowboarding', 'Scuba diving', 'Cheerleading', 'Hurdles', 'Rowing',
      'Hockey', 'Cricket', 'Bowling', 'Weightlifting', 'Gymnastics',
      'Dodgeball', 'Ballet', 'Parkour', 'Sailing', 'Judo',
      'Tug of war', 'Trampoline', 'Cycling', 'High jump', 'Ice hockey',
      'Basketball', 'Volleyball', 'Rugby tackle', 'Hula hooping', 'Zumba',
    ],
  },
  {
    id: 'food',
    name: 'Food & Drink',
    emoji: '🍕',
    description: 'Do not play this one hungry',
    words: [
      'Pizza', 'Sushi', 'Croissant', 'Guacamole', 'Bubble tea',
      'Spaghetti', 'Pancakes', 'Hot dog', 'Cheeseboard', 'Espresso',
      'Ramen', 'Popcorn', 'Avocado toast', 'Fondue', 'Doughnut',
      'Kebab', 'Paella', 'Nachos', 'Tiramisu', 'Smoothie',
      'Peanut butter', 'Baguette', 'Dumplings', 'Fried chicken', 'Ice cream',
      'Watermelon', 'Curry', 'Pretzel', 'Marshmallow', 'Oyster',
      'Pad thai', 'Waffle', 'Burrito', 'Caviar', 'Cotton candy',
      'Sourdough', 'Chilli pepper', 'Lasagne', 'Milkshake', 'Falafel',
      'Cheeseburger', 'Pickle', 'Champagne', 'Toast', 'Poached egg',
    ],
  },
  {
    id: 'internet',
    name: 'Internet Culture',
    emoji: '💻',
    description: 'Very online, very fast',
    words: [
      'Rickroll', 'Doomscrolling', 'Unboxing video', 'Group chat', 'Wordle',
      'Zoom call', 'Autocorrect fail', 'Cat video', 'Influencer', 'Podcast',
      'Emoji', 'Meme', 'Streaming', 'Selfie stick', 'Airdrop',
      'Two-factor auth', 'Slack notification', 'Out of office', 'Screenshot', 'Wi-Fi password',
      'Dark mode', 'Spam folder', 'Cookie banner', 'Playlist', 'Group video call',
      'Airplane mode', 'Password reset', 'Cloud storage', 'Buffering', 'Notification bell',
      'Ghosting', 'Hashtag', 'Livestream', 'Filter', 'Follower count',
      'Pull request', 'Merge conflict', 'Standup meeting', 'Rubber duck debugging', 'Hot desk',
      'Battery at 1%', 'Do not disturb', 'Read receipt', 'Deep fake', 'Chatbot',
    ],
  },
]

export const getDeck = (id: string): Deck | undefined => decks.find((d) => d.id === id)

/** Fisher-Yates, so a deck plays in a different order every room. */
export function shuffleWords(words: string[]): string[] {
  const copy = [...words]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
