import { Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import RecipeBook from './pages/RecipeBook';
import RecipeDetail from './pages/RecipeDetail';
import ShoppingList from './pages/ShoppingList';
import RecipeForm from './pages/RecipeForm';
import ChefkochSearch from './pages/ChefkochSearch';
import MealPlanner from './pages/MealPlanner';
import TodayCard from './pages/TodayCard';

function App() {
  const location = useLocation();
  const isDashboardCard = location.pathname === '/today-card';

  return (
    <div className="app-container">
      {!isDashboardCard && <Navbar />}
      <main className={isDashboardCard ? 'dashboard-card-content animate-fade-in' : 'main-content animate-fade-in'}>
        <Routes>
          <Route path="/" element={<RecipeBook />} />
          <Route path="/discover" element={<ChefkochSearch />} />
          <Route path="/planner" element={<MealPlanner />} />
          <Route path="/today-card" element={<TodayCard />} />
          <Route path="/recipe/new" element={<RecipeForm />} />
          <Route path="/recipe/edit/:id" element={<RecipeForm />} />
          <Route path="/recipe/:id" element={<RecipeDetail />} />
          <Route path="/shopping-list" element={<ShoppingList />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
