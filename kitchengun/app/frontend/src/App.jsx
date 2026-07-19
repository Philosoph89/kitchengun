import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import RecipeBook from './pages/RecipeBook';
import RecipeDetail from './pages/RecipeDetail';
import ShoppingList from './pages/ShoppingList';
import RecipeForm from './pages/RecipeForm';
import ChefkochSearch from './pages/ChefkochSearch';
import MealPlanner from './pages/MealPlanner';
import TodayCard from './pages/TodayCard';
import Inventory from './pages/Inventory';

function isTodayCardRequest(location) {
  const searchParams =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const browserPath = typeof window !== 'undefined' ? window.location.pathname : '';

  return (
    location.pathname === '/today-card' ||
    browserPath.endsWith('/today-card') ||
    browserPath.endsWith('/today-card/') ||
    hash === '#/today-card' ||
    hash.startsWith('#/today-card?') ||
    searchParams.get('view') === 'today-card' ||
    searchParams.get('card') === 'today'
  );
}

function App() {
  const location = useLocation();
  const isDashboardCard = isTodayCardRequest(location);

  if (isDashboardCard) {
    return (
      <div className="app-container dashboard-card-app">
        <main className="dashboard-card-content animate-fade-in">
          <TodayCard />
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <Navbar />
      <main className="main-content animate-fade-in">
        <Routes>
          <Route path="/" element={<RecipeBook />} />
          <Route path="/discover" element={<ChefkochSearch />} />
          <Route path="/planner" element={<MealPlanner />} />
          <Route path="/today-card" element={<TodayCard />} />
          <Route path="/recipe/new" element={<RecipeForm />} />
          <Route path="/recipe/edit/:id" element={<RecipeForm />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route path="/shopping-list" element={<ShoppingList />} />
          <Route path="/inventory" element={<Inventory />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
