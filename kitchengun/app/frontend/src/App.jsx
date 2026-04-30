import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import RecipeBook from './pages/RecipeBook';
import RecipeDetail from './pages/RecipeDetail';
import ShoppingList from './pages/ShoppingList';
import RecipeForm from './pages/RecipeForm';
import ChefkochSearch from './pages/ChefkochSearch';
import MealPlanner from './pages/MealPlanner';

function App() {
  return (
    <div className="app-container">
      <Navbar />
      <main className="main-content animate-fade-in">
        <Routes>
          <Route path="/" element={<RecipeBook />} />
          <Route path="/discover" element={<ChefkochSearch />} />
          <Route path="/planner" element={<MealPlanner />} />
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
