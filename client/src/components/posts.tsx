import { useContext } from 'react'
import truncate from 'truncate'
import { Post } from '../lib/api'
import { ProjectCard } from './project-card'
import { useTime } from './time'

const Posts = ({ posts, fish }: { posts: Post[], fish?: string }) => {
  const colors = useTime().lightningTimeColors;

  return (
    <div className="pr-2 pl-3 w-full flex flex-col items-center">
      {fish===undefined ? <></> : 
        <><div className="flex flex-col items-center">
          <img src={fish} className="mt-2 max-h-40 rounded-lg" />
          <h1 className="text-2xl mt-2 font-bold font-mono">FISH OF THE DAY</h1>
        </div>
        <div className="bg-gray-300 self-stretch border-0 rounded h-0.5 my-4" ></div></>}


      {[...posts].reverse().map((post: Post, i: number) => (
        <ProjectCard
          username={post.username}
          key={i}
          avatar={post.avatar}
          description={truncate(post.content, 90)}
          imageUrl={post.images.length ? post.images[0] : undefined}
          color={Object.values(colors)[i%colors.length]}
          time={post.time}
        />
      ))}
    </div>
  )
}

export default Posts
