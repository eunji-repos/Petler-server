import { PubSub, withFilter } from "apollo-server-express";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import schedule from "node-schedule";
import models from "../models";
import hash from "../auth/hash";

dotenv.config();
const pubSub = new PubSub();

const resolvers = {
  Query: {
    // user: async (_, { email = "null", id = "null" }) => {
    //   const user = await models.user.findOne({
    //     where: {
    //       [Op.or]: [{ email }, { id }],
    //     },
    //   });
    //    if (!user) {
    //        throw new Error("찾는 유저가 없습니다.");
    //      }
    //   const channel = await user.getChannels().map((item) => {
    //     return item.dataValues;
    //   });
    //   user.channel = channel;
    //   return user;
    // },
    user: async (_, { token }) => {
      const decoded = await jwt.verify(token, process.env.JWT_SECRET);
      const user = await models.user.findOne({
        where: { email: decoded.email },
      });
      return user;
    },
    channel: async (_, args) => {
      const channel = await models.channel.findOne({
        where: { id: args.id },
      });
      return channel;
    },
    login: async (_, { email, password }) => {
      const user = await models.user.findOne({
        where: { email },
      });
      if (!user) {
        throw new Error("가입되지 않은 아이디입니다");
      }
      const valid = hash(password);
      if (valid !== user.dataValues.password) {
        throw new Error("비밀번호가 일치하지 않습니다");
      }
      const token = jwt.sign({ email, valid }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });
      const channel = await user.getChannels().map((item) => {
        return item.dataValues;
      });
      return { token, user, channel };
    },
    pet: async (_, { id }) => {
      const pet = await models.pet.findOne({
        where: { id },
      });
      if (!pet) {
        throw new Error("찾는 pet이 없습니다.");
      }
      return pet;
    },
    getUserByToken: async (_, { token }) => {
      const decoded = await jwt.verify(token, process.env.JWT_SECRET);
      // console.log(decoded.exp < Date.now().splite(-3));
      // console.log(decoded.exp);
      // console.log(Date.now());
      // if (decoded.exp < Date.now() / 1000) {
      //   throw new Error("token 만료 기간이 지났습니다.");
      // }
      const user = await models.user.findOne({
        where: { email: decoded.email },
      });
      if (!user) {
        throw new Error("일치하는 유저 정보가 없습니다");
      }
      return user;
    },
    todo: async (_, args) => {
      const todo = await models.todo.findOne({ where: { id: args.id } });
      if (!todo) {
        throw new Error("일치하는 todo가 없습니다");
      }
      return todo;
    },
    photo: async (_, args) => {
      const photo = await models.gallery.findOne({ where: { id: args.id } });
      if (!photo) {
        throw new Error("일치하는 photo가 없습니다");
      }
      return photo;
    },
    confirmPW: async (_, { token, password }) => {
      const decoded = await jwt.verify(token, process.env.JWT_SECRET);
      const user = await models.user.findOne({
        where: { email: decoded.email },
      });
      const valid = hash(password);
      return valid === user.dataValues.password;
    },
    checkEmail: async (_, { email }) => {
      const user = await models.user.findOne({ where: { email } });
      if (user) return user.email;
      return user;
    },
  },
  User: {
    channels: async (user, { id }) => {
      const channels = await user.getChannels();
      if (id) {
        return channels.filter((c) => {
          return `${c.dataValues.id}` === id;
        });
      }
      return channels;
    },
  },
  Channel: {
    users: async (channel, { id }) => {
      const users = await channel.getUsers();
      users.forEach((item) => {
        // eslint-disable-next-line no-param-reassign
        item.user_channel_id = item.user_channel.dataValues.id;
      });
      if (id) {
        return users.filter((c) => {
          return `${c.dataValues.id}` === id;
        });
      }
      return users;
    },
    pets: async (channel, { id }) => {
      const pets = await channel.getPets();
      if (id) {
        return pets.filter((c) => {
          return `${c.dataValues.id}` === id;
        });
      }
      return pets;
    },
    todos: async (channel, { id }) => {
      const todos = await channel.getTodos();
      if (id) {
        return todos.filter((c) => {
          return `${c.dataValues.id}` === id;
        });
      }
      return todos;
    },
    checkUser: async (channel, { email }) => {
      const users = await channel.getUsers();
      const isUser = users.filter((user) => {
        return user.dataValues.email === email;
      });
      if (isUser.length) return true;
      return false;
    },
    setAlarm: async (channel) => {
      const alarm = channel.user_channel.dataValues.set_alarm;
      return alarm;
    },
  },
  Todo: {
    // assignee: async (todo) => {
    //   const userChannel = await todo.getUser_channels();
    //   const userId = userChannel.map((v) => {
    //     return v.dataValues.user_id;
    //   });
    //   const users = [];
    //   return Promise.all(
    //     userId.map((v) => {
    //       return models.user.findOne({ where: { id: v } });
    //     }),
    //   )
    //     .then((values) => {
    //       values.forEach((u) => {
    //         users.push(u.dataValues);
    //       });
    //       return users;
    //     })
    //     .catch((err) => {
    //       console.log(err);
    //     });
    // },
    assigned_id: async (todo) => {
      const userChannel = await todo.getUser_channels();
      const userId = userChannel[0].dataValues.id;
      return userId;
    },
    pets: async (todo) => {
      const todos = await todo.getPet();
      const pet = todos.dataValues;
      return pet;
    },
    complete_date: async (todo) => {
      const todos = await todo.getUser_channels();
      const completeUser = todos.filter((item) => {
        return item.user_channel_todo.dataValues.complete_date !== null;
      });
      if (completeUser.length === 0) {
        return null;
      }
      const userChannelTodo = completeUser[0].user_channel_todo.dataValues.complete_date;
      return userChannelTodo;
    },
    writer: async (todo) => {
      const userChannelData = await models.user_channel.findOne({
        where: { id: todo.user_channel_id },
      });
      const user = await models.user.findOne({ where: { id: userChannelData.dataValues.user_id } });
      return user;
    },
  },
  Pet: {
    todos: async (pet, { id }) => {
      const todos = await pet.getTodos();
      if (id) {
        return todos.filter((c) => {
          return `${c.dataValues.id}` === id;
        });
      }
      return todos;
    },
  },
  Mutation: {
    signUp: async (_, { userInfo }) => {
      const signed = await models.user.findOne({
        where: { email: userInfo.email },
      });
      if (signed) {
        throw new Error("이미 가입된 사용자입니다.");
      }
      const newUser = models.user.create({
        name: userInfo.name,
        email: userInfo.email,
        password: hash(userInfo.password),
        img: userInfo.img,
      });
      return newUser;
    },
    updateUserInfo: async (_, { token, name, img }) => {
      const decoded = await jwt.verify(token, process.env.JWT_SECRET);
      const { dataValues } = await models.user.findOne({ where: { email: decoded.email } });
      await models.user.update({ name, img }, { where: { id: dataValues.id } });
      const user = await models.user.findOne({ where: { id: dataValues.id } });
      if (user.dataValues.name === name && user.dataValues.img === img) {
        return true;
      }
      return false;
    },
    createChannel: async (_, { channelInfo }) => {
      const decoded = await jwt.verify(channelInfo.token, process.env.JWT_SECRET);
      const { dataValues } = await models.user.findOne({ where: { email: decoded.email } });
      const newChannel = await models.channel.create({
        img: channelInfo.img,
        name: channelInfo.name,
      });
      newChannel.addUser(dataValues.id);
      return newChannel;
    },
    updateChannel: async (_, { channelInfo }) => {
      if (!channelInfo.channelId) {
        throw new Error("channel ID 를 입력해주세요.");
      }
      await jwt.verify(channelInfo.token, process.env.JWT_SECRET);
      await models.channel.update(
        {
          img: channelInfo.img,
          name: channelInfo.name,
        },
        { where: { id: channelInfo.channelId } },
      );
      const { dataValues } = await models.channel.findOne({
        where: { id: channelInfo.channelId },
      });

      if (dataValues.name !== channelInfo.name) return false;
      if (dataValues.img !== channelInfo.img) return false;
      return true;
    },
    deleteChannel: async (_, { token, id }) => {
      await jwt.verify(token, process.env.JWT_SECRET);
      const result = await models.channel.destroy({ where: { id } });
      return !!result;
    },
    createPet: async (_, { petInfo }) => {
      if (!petInfo.channelId) {
        throw new Error("channel ID 를 입력해주세요");
      }
      await jwt.verify(petInfo.token, process.env.JWT_SECRET);
      const pet = await models.pet.create({
        name: petInfo.name,
        gender: petInfo.gender,
        age: petInfo.age,
        type: petInfo.type,
        type_detail: petInfo.typeDetail,
        intro: petInfo.intro,
        img: petInfo.img,
        todo_color: petInfo.todoColor,
        card_cover: petInfo.cardCover,
        channel_id: petInfo.channelId,
      });
      return pet;
    },
    updatePet: async (_, { updatePet }) => {
      if (!updatePet.petId) {
        throw new Error("pet ID 를 입력해주세요");
      }
      await jwt.verify(updatePet.token, process.env.JWT_SECRET);
      await models.pet.update(
        {
          name: updatePet.name,
          gender: updatePet.gender,
          age: updatePet.age,
          type: updatePet.type,
          type_detail: updatePet.typeDetail,
          intro: updatePet.intro,
          img: updatePet.img,
          todo_color: updatePet.todoColor,
          card_cover: updatePet.cardCover,
        },
        { where: { id: updatePet.petId } },
      );
      const { dataValues } = await models.pet.findOne({ where: { id: updatePet.petId } });
      if (
        dataValues.name === updatePet.name
        && dataValues.gender === updatePet.gender
        && dataValues.age === updatePet.age
        && dataValues.type === updatePet.type
        && dataValues.type_detail === updatePet.typeDetail
        && dataValues.intro === updatePet.intro
        && dataValues.img === updatePet.img
        && dataValues.todo_color === updatePet.todoColor
        && dataValues.card_cover === updatePet.cardCover
      ) {
        return true;
      }
      return false;
    },
    deletePet: async (_, { token, id }) => {
      await jwt.verify(token, process.env.JWT_SECRET);
      const pet = await models.pet.findOne({ where: { id } });
      if (!pet) {
        throw new Error("펫이 존재하지 않습니다.");
      }
      const value = await models.pet.destroy({ where: { id } });
      if (!value) {
        throw new Error("삭제가 실패하였습니다.");
      }
      return pet.name;
    },
    createTodo: async (_, { todoInfo }) => {
      if (!todoInfo.channel_id) throw new Error("channel ID 를 입력해주세요");
      const { email } = await jwt.verify(todoInfo.token, process.env.JWT_SECRET);
      const user = await models.user.findOne({ where: { email } });
      const channelByUser = await user.getChannels().filter((item) => {
        return `${item.dataValues.id}` === todoInfo.channel_id;
      });
      const channelIdByUser = channelByUser[0].dataValues.user_channel.dataValues.id;
      const todo = await models.todo.create({
        todo: todoInfo.todo,
        memo: todoInfo.memo,
        push_date: todoInfo.push_date,
        end_date: todoInfo.end_date,
        repeat_day: todoInfo.repeat_day,
        pet_id: todoInfo.pet_id,
        channel_id: todoInfo.channel_id,
        user_channel_id: channelIdByUser,
      });
      const arrAssignedId = todoInfo.assigned_id.split(",");
      arrAssignedId.forEach((item) => {
        todo.addUser_channel(item);
      });
      arrAssignedId.forEach(async (item) => {
        const userChannel = await models.user_channel.findOne({ where: { id: item } });
        const assignedUser = await models.user.findOne({
          where: { id: userChannel.dataValues.user_id },
        });
        console.log(assignedUser.dataValues);
        console.log(todo.dataValues); // FCM서버로 보내는 로직 추후 작성
      });
      if (todo) {
        pubSub.publish("TODO", {
          todo: { mutation: "CREATE_TODO", data: todo, channel_id: todo.channel_id },
        });
        if (todo.dataValues.push_date) {
          schedule.scheduleJob(`todo${todo.dataValues.id}`, todo.dataValues.push_date, () => {
            console.log(todo.dataValues.todo); // FCM서버로 보내는 로직 추후 작성
          });
        }
      }
      // user_channel에 존재하지 않은 값이 들어가면 서버에서는 오류를 띄우는데 투두 테이블에는 추가가 된다. 그걸 막고 싶은데 방법이 없을까?
      return todo;
    },
    updateTodo: async (_, { updateTodoInfo }) => {
      if (!updateTodoInfo.todo_id) throw new Error("Todo ID 를 입력해주세요");
      await jwt.verify(updateTodoInfo.token, process.env.JWT_SECRET);
      await models.todo.update(
        {
          todo: updateTodoInfo.todo,
          memo: updateTodoInfo.memo,
          push_date: updateTodoInfo.push_date,
          end_date: updateTodoInfo.end_date,
          repeat_day: updateTodoInfo.repeat_day,
          pet_id: updateTodoInfo.pet_id,
        },
        { where: { id: updateTodoInfo.todo_id } },
      );
      const todo = await models.todo.findOne({
        where: { id: updateTodoInfo.todo_id },
      });
      const assinged = await todo.getUser_channels().map((item) => {
        return item.dataValues.id;
      });
      if (assinged.join() !== updateTodoInfo.assigned_id) {
        await models.user_channel_todo.destroy({ where: { todo_id: updateTodoInfo.todo_id } });
        const arrAssignedId = updateTodoInfo.assigned_id.split(",");
        arrAssignedId.forEach((item) => {
          todo.addUser_channel(item);
        });
        arrAssignedId.forEach(async (item) => {
          const userChannel = await models.user_channel.findOne({ where: { id: item } });
          const assignedUser = await models.user.findOne({
            where: { id: userChannel.dataValues.user_id },
          });
          console.log(assignedUser.dataValues);
          console.log(todo.dataValues); // FCM서버로 보내는 로직 추후 작성
        });
      }
      if (
        todo.dataValues.todo === updateTodoInfo.todo
        && todo.dataValues.memo === updateTodoInfo.memo
        // todo.dataValues.push_date === updateTodoInfo.push_date &&
        // todo.dataValues.end_date === updateTodoInfo.end_date &&
        && todo.dataValues.repeat_day === updateTodoInfo.repeat_day
        && `${todo.dataValues.pet_id}` === updateTodoInfo.pet_id
      ) {
        pubSub.publish("TODO", {
          todo: { mutation: "UPDATE_TODO", data: todo, channel_id: todo.dataValues.channel_id },
        });
        if (schedule.scheduledJobs[`todo${todo.dataValues.id}`]) {
          schedule.scheduledJobs[`todo${todo.dataValues.id}`].cancel();
        }
        if (todo.dataValues.push_date) {
          schedule.scheduleJob(`todo${todo.dataValues.id}`, todo.dataValues.push_date, () => {
            console.log(todo.dataValues.todo);
            console.log(todo.dataValues.push_date); // FCM서버로 보내는 로직 추후 작성
          });
        }
        return true;
      }
      return false;
    },
    deleteTodo: async (_, { token, id }) => {
      await jwt.verify(token, process.env.JWT_SECRET);
      const todo = await models.todo.findOne({ where: { id } });
      if (!todo) {
        throw new Error("Todo 가 존재하지 않습니다.");
      }
      const value = await models.todo.destroy({ where: { id } });

      if (!value) {
        throw new Error("삭제를 실패하였습니다.");
      }
      pubSub.publish("TODO", {
        todo: { mutation: "DELETE_TODO", data: todo, channel_id: todo.dataValues.channel_id },
      });
      if (schedule.scheduledJobs[`todo${todo.dataValues.id}`]) {
        schedule.scheduledJobs[`todo${todo.dataValues.id}`].cancel();
      }
      return true;
    },
    updateAlarm: async (_, { token, channelId }) => {
      const { email } = await jwt.verify(token, process.env.JWT_SECRET);
      const user = await models.user.findOne({
        where: { email },
      });
      const channel = await user.getChannels().filter((item) => {
        return `${item.dataValues.id}` === channelId;
      });
      const alarm = channel[0].user_channel.dataValues.set_alarm;
      const ID = channel[0].user_channel.dataValues.id;
      await models.user_channel.update(
        {
          set_alarm: !alarm,
        },
        { where: { id: ID } },
      );
      const result = await models.user_channel.findOne({
        where: {
          id: ID,
        },
      });
      return alarm === result.dataValues.set_alarm;
    },
    isDoneTodo: async (_, { token, id }) => {
      const { email } = await jwt.verify(token, process.env.JWT_SECRET);
      const { dataValues } = await models.user.findOne({ where: { email } });
      const todo = await models.todo.findOne({ where: { id } });
      if (!todo) {
        throw new Error("해당 todo 가 존재하지 않습니다");
      }
      await models.todo.update(
        {
          is_done: !todo.is_done,
        },
        { where: { id } },
      );
      const userChannelByTodo = await todo.getUser_channels().filter((item) => {
        return item.dataValues.user_id === dataValues.id;
      });
      const isTrue = await models.todo.findOne({ where: { id } });
      if (userChannelByTodo.length === 0) {
        await models.user_channel_todo.update({ complete_date: null }, { where: { todo_id: id } });
        const userChannelId = await models.user_channel.findOne({
          where: { user_id: dataValues.id, channel_id: isTrue.channelId },
        });
        await todo.addUser_channel(userChannelId.dataValues.id, {
          through: { complete_date: isTrue.is_done ? new Date() : null },
        });
      } else {
        await models.user_channel_todo.update({ complete_date: null }, { where: { todo_id: id } });
        const userChannelTodoId = userChannelByTodo[0].dataValues.user_channel_todo.dataValues.id;
        await models.user_channel_todo.update(
          { complete_date: isTrue.is_done ? new Date() : null },
          { where: { id: userChannelTodoId } },
        );
      }
      pubSub.publish("TODO", {
        todo: { mutation: "IS_DONE_TODO", data: isTrue, channel_id: todo.dataValues.channel_id },
      });
      return isTrue.is_done;
    },
    addUserToChannel: async (_, { token, email, channelId }) => {
      await jwt.verify(token, process.env.JWT_SECRET);
      const invitedUser = await models.user.findOne({ where: { email } });
      if (!invitedUser) {
        throw new Error("초대가능한 유저가 아닙니다.");
      }
      await invitedUser.addChannel(channelId);
      return email;
    },
    createPhoto: async (_, { img, memo }) => {
      const photo = await models.gallery.create({ img, memo });
      return photo;
    },
    updatePhoto: async (_, { id, img, memo }) => {
      await models.gallery.update(
        {
          img,
          memo,
        },
        { where: { id } },
      );
      const { dataValues } = await models.gallery.findOne({
        where: { id },
      });
      if (dataValues.img === img && dataValues.memo === memo) return true;
      return false;
    },
    deletePhoto: async (_, { id }) => {
      const photo = await models.gallery.findOne({ where: { id } });
      if (!photo) {
        throw new Error("해당 photo 가 존재하지 않습니다.");
      }
      const value = await models.gallery.destroy({ where: { id } });
      if (!value) {
        throw new Error("삭제를 실패하였습니다.");
      }
      return true;
    },
    updatePassword: async (_, { token, password }) => {
      const decoded = await jwt.verify(token, process.env.JWT_SECRET);
      await models.user.update(
        {
          password: hash(password),
        },
        { where: { email: decoded.email } },
      );
      const { dataValues } = await models.user.findOne({
        where: { email: decoded.email },
      });
      return hash(password) === dataValues.password;
    },
    dismissUser: async (_, { token, dismissId, channelId }) => {
      await jwt.verify(token, process.env.JWT_SECRET);
      const dismiss = await models.user_channel.destroy({
        where: { user_id: dismissId, channel_id: channelId },
      });
      if (dismiss) return true;
      return false;
    },
  },
  Subscription: {
    todo: {
      subscribe: withFilter(
        () => {
          return pubSub.asyncIterator("TODO");
        },
        (payload, variables) => {
          return `${payload.todo.channel_id}` === variables.channel_id;
        },
      ),
    },
    // todo: {
    //   subscribe: () => {
    //     return pubSub.asyncIterator(["TODO"]);
    //   },
    // },
  },
};

export default resolvers;
